import Logger from './Logger';
import * as util from 'util';

/**
 * An extension of the base logger which accepts log input on a HTTP URL.
 *
 * Its main method is log(level, message, context).
 *
 * @see ServerLogger.log
 */
class ServerLogger extends Logger {
  /**
   * @constructor
   *
   * @param {object} mongo
   *   The Meteor Mongo service.
   * @param {object} webapp
   *   The Meteor WebApp service.
   * @param {Object} parameters
   *   - servePath: the path on which to expose the logger endpoint.
   *   - collectionName: the collection in which to store log data
   */
  constructor(mongo, webapp = null, parameters = {}) {
    super();
    const defaultParameters = {
      servePath: '/logger',
      collectionName: 'logger'
    };

    for (const key in defaultParameters) {
      this[key] = (typeof parameters[key] !== 'undefined')
        ? parameters[key]
        : defaultParameters[key];
    }

    this.setupMongo(mongo, this.collectionName);
    this.setupConnect(webapp, this.servePath);
  }

  log(level, message, context) {
    let doc = { level, message };
    if (typeof context !== 'undefined') {
      doc.context = context;
    }
    this.store.insert(doc);
  }

  /**
   * Handle a log message from the client.
   *
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   * @param {function} next
   */
  handleClientLogRequest(req, res, next) {
    const method = req.method.toUpperCase();
    if (method !== 'POST') {
      // RFC2616: 405 means Method not allowed.
      res.writeHead(405);
      res.end();
      return;
    }
    res.writeHead(200);

    // @TODO Node defaults to 10 listeners, but we need at least 11. Find out why.
    req.setMaxListeners(20);

    req.on('data', Meteor.bindEnvironment(buf => {
      const doc = JSON.parse(buf.toString('utf-8'));
      // RFC 5424 Table 2: 7 == debug
      const level = doc.level ? doc.level : 7;
      const message = ServerLogger.stringizeMessage(doc.message);
      const context = ServerLogger.objectizeContext(doc.context);
      this.log(level, message, context);
    }, (e) => { console.log(e); }));
    res.end('');
  }

  /**
   * Return a plain message string from any shape of document.
   *
   * @param {*} doc
   *   Expect it to be an object with a "message" key with a string value, but
   *   accept anything.
   *
   * @returns {*}
   *   A string, as close to the string representation of doc.message as
   *   feasible.
   */
  static stringizeMessage(doc) {
    const rawMessage = doc.message;
    let message;
    if (rawMessage) {
      if (typeof rawMessage === 'string') {
        message = rawMessage;
      }
      else if (typeof rawMessage.toString === 'function') {
        message = rawMessage.toString();
      }
    }
    else {
      message = util.inspect(doc);
    }
    return message;
  }

  /**
   * Return a plain object for all types of context values.
   *
   * @param {*} rawContext
   *   Expect a POJO but accept just about anything.
   *
   * @returns {{}}
   *   - Contexts which are objects are returned as the same key/values, but as
   *     POJOs, even for arrays.
   *   - Scalar contexts are returned as { value: <original value> }
   */
  static objectizeContext(rawContext) {
    let context = {};
    // Arrays are already objects, but we want them as plain objects.
    if (typeof rawContext === 'object') {
      if (rawContext.constructor.name === 'Array') {
        context = Object.assign({}, context);
      }
      else {
        context = rawContext;
      }
    }
    // Other data types are not objects, so we need to convert them.
    else {
      context = { value: rawContext };
    }
    return context;
  }

  setupMongo(mongo, collectionName) {
    this.mongo = mongo;
    let collection = this.mongo.Collection.get(collectionName);
    this.store = collection ? collection : new this.mongo.Collection(collectionName);
  }

  setupConnect(webapp, servePath) {
    this.webapp = webapp;
    if (this.webapp) {
      console.log('Serving logger on', servePath);
      let app = this.webapp.connectHandlers;
      app.use(this.servePath, this.handleClientLogRequest.bind(this));
    }
    else {
      console.log('Not serving logger, path', servePath);
    }
  }
}

export default ServerLogger;
