import "babel-polyfill";
import LogLevel from "../../src/LogLevel";
import InvalidArgumentException from "../../src/InvalidArgumentException";
import MongoDbSender from "../../src/Senders/MongodbSender";
import Logger from "../../src/Logger";
import ServerLogger from "../../src/ServerLogger";
import SyslogSender from "../../src/Senders/SyslogSender";

const sinon = require("sinon");
const chai = require("chai");
const chaiHttp = require("chai-http");
const assert = chai.assert;

chai.use(chaiHttp);

function testImmutableContext() {
  "use strict";
  const strategy = {
    customizeLogger: () => [],
    customizeSenders: () => [],
    selectSenders: () => []
  };
  it("should not modify context in log() calls", function () {
    const logger = new Logger(strategy);
    const originalContext = {};
    const context = { ...originalContext };
    assert.equal(JSON.stringify(context), JSON.stringify(originalContext), "Pre-log context matches original context");
    logger.log(LogLevel.DEBUG, "some message", context);
    assert.equal(JSON.stringify(context), JSON.stringify(originalContext), "Post-log context matches original context");
  });
}

function testLogLevels() {
  "use strict";
  const strategy = {
    customizeLogger: () => [],
    customizeSenders: () => [],
    selectSenders: () => []
  };
  it("log() should throw on non-integer levels", function () {
    const logger = new Logger(strategy);
    assert.throws(() => {
      //noinspection Eslint
      logger.log(4.2, "Not an integer", {});
    }, InvalidArgumentException);
    assert.throws(() => {
      //noinspection Eslint
      logger.log("5", "Not an integer", {});
    }, InvalidArgumentException);
    assert.throws(() => {
      //noinspection Eslint
      logger.log({}, "Not an integer", {});
    }, InvalidArgumentException);
  });
  it ("log() should throw on integer levels out of range", function () {
    const logger = new Logger(strategy);
    assert.throws(() => {
      //noinspection Eslint
      logger.log(-1, "Not an integer", {});
    }, InvalidArgumentException);
    assert.throws(() => {
      //noinspection Eslint
      logger.log(8, "Not an integer", {});
    }, InvalidArgumentException);
  });
}

function testMongoDbSender() {
  const mongo = {
    Collection: function (name) {
      this.insert = () => {};
      this.name = name;
    }
  };
  it("should accept a collection name", function () {
    const spy = sinon.spy(mongo, 'Collection');
    const sender = new MongoDbSender([], mongo, 'some_collection');
    assert.instanceOf(sender, MongoDbSender);
    assert.equal(spy.calledOnce, true);
  });
  it("should accept an existing collection", function () {
    const collection = new mongo.Collection("fake");
    const sender = new MongoDbSender([], mongo, collection);
    assert.instanceOf(sender, MongoDbSender);
    assert.equal(sender.store, collection);
  });
  it("should reject invalid collection values", function () {
    const collection = 25;
    assert.throw(() => {
      //noinspection Eslint
      new MongoDbSender([], mongo, collection);
    }, Error);
  });
  it("should add a \"store\" timestamp to empty context", function () {
    const collection = new mongo.Collection("fake");
    const sender = new MongoDbSender([], mongo, collection);
    const insertSpy = sinon.spy(sender.store, "insert");
    const before = +new Date();
    const inboundArgs = [0, "message", {}];

    sender.send(...inboundArgs);
    const after = +new Date();
    assert.equal(insertSpy.calledOnce, true, "Collection.insert was called once.");
    const callArgs = insertSpy.firstCall.args[0];
    assert.equal(callArgs.level, inboundArgs[0], "Level is passed");
    assert.equal(callArgs.message, inboundArgs[1], "Level is passed");
    const timestamp = callArgs.context.timestamp.store;
    assert.equal(typeof timestamp, "number", "A numeric store timestamp is passed");
    assert.equal(timestamp >= before, true, "Timestamp is later than 'before'");
    assert.equal(timestamp <= after, true, "Timestamp is earlier than 'after'");
  });
  it("should add a \"store\" timestamp to non-empty context", function () {
    const collection = new mongo.Collection("fake");
    const sender = new MongoDbSender([], mongo, collection);
    const insertSpy = sinon.spy(sender.store, "insert");
    const before = +new Date();
    const inboundArgs = [0, "message", { timestamp: { whatever: 1480849124018 } }];

    sender.send(...inboundArgs);
    const after = +new Date();
    assert.equal(insertSpy.calledOnce, true, "Collection.insert was called once.");
    const callArgs = insertSpy.firstCall.args[0];
    assert.equal(callArgs.level, inboundArgs[0], "Level is passed");
    assert.equal(callArgs.message, inboundArgs[1], "Level is passed");
    const timestamp = callArgs.context.timestamp.store;
    assert.equal(typeof timestamp, "number", "A numeric store timestamp is passed");
    assert.equal(timestamp >= before, true, "Timestamp is later than 'before'");
    assert.equal(timestamp <= after, true, "Timestamp is earlier than 'after'");
  });
}

function testObjectifyContext() {
  const objectifyContext = ServerLogger.objectifyContext;

  it("should convert arrays to POJOs", () => {
    const a = ["a", "b"];
    const o = objectifyContext(a);
    assert.equal(typeof o, "object");
    assert.equal(o.constructor.name, "Object");
  });

  it("should convert scalars to POJOs with a value key", () => {
    const scalars = [
      "Hello, world", "",
      42, +0, -0, 0, NaN, -Infinity, +Infinity,
      null,
      true, false,
      // eslint-disable-next-line no-undefined
      undefined
    ];

    scalars.forEach(v => {
      const actual = objectifyContext(v);
      const printable = JSON.stringify(actual);
      assert.equal(typeof actual, "object", `Result type is "object" for ${printable}.`);
      assert.equal(actual.constructor.name, "Object", `Result constructor is "Object" for ${printable}.`);
      const actualKeys = Object.keys(actual);
      assert.equal(actualKeys.length, 1, `Result has a single key for ${printable}.`);
      assert.equal(actualKeys[0], "value", `Result key is called "value" for ${printable}.`);
      assert.isTrue(Object.is(actual.value, v), `Result value is the original value for ${printable}.`);
    });
  });

  it("should not modify existing POJOs", () => {
    const raw = {a: "b"};
    const actual = objectifyContext(raw);
    assert.strictEqual(actual, raw);
  });

  it("should convert date objects to ISO date strings", () => {
    const d = new Date(Date.UTC(2016, 5, 24, 16, 0, 30, 250));
    const actual = objectifyContext(d);
    assert.equal(typeof actual, "string", "Result for date object is a string");
    assert.equal(actual, d.toISOString(), "2016-05-24T16:00:30.250Z : Result is the ISO representation of the date");
  });

  // TODO also check wrapper objects with no keys like new Number(25), new Boolean(true).
  it("should downgrade miscellaneous classed objects to POJOs", () => {
    const value = "foo";
    class Foo {
      constructor(v) {
        this.k = v;
      }
    }
    const initial = new Foo(value);
    assert.equal(typeof initial, "object");
    assert.equal(initial.constructor.name, "Foo");

    const actual = objectifyContext(initial);
    assert.equal(JSON.stringify(Object.keys(actual)), JSON.stringify(["k"]), "Result has same properties as initial object");
    assert.equal(actual.k, value, "Result has same values as initial object");
    assert.equal(typeof actual, "object", "Result is an object");
    assert.equal(actual.constructor.name, "Object", "Result constructor is \"Object\".");
    assert.notStrictEqual(actual, initial, "Result is not the initial object itself.");
    assert.notEqual(actual, initial, "Result is not even equal to the initial object");
  });
}

function testStringifyMessage() {
  const stringify = ServerLogger.stringifyMessage;

  it("should convert strings", () => {
    const value = "foo";

    class Printable {
      constructor(v) {
        this.k = v;
      }

      toString() {
        return JSON.stringify(this.k);
      }
    }

    const o = new Printable(value);

    const expectations = [
      [{ message: "foo" }, "foo"],
      [{ message: 25 }, "25"],
      [{ message: o }, JSON.stringify(value)],
      [{}, "{}"],
      [[], "[]"],
      ["foo", "foo"]
    ];

    for (const expectation of expectations) {
      const doc = expectation[0];
      const expected = expectation[1];
      const actual = stringify(doc);
      assert.strictEqual(actual, expected, "Converting " + JSON.stringify(doc));
    }
  });
}

function testSerializeDeepObject() {
  const LOCAL0 = 16;
  const logLevelWarn = 3;

  const makeSyslog = () => ({
    level: {
      [logLevelWarn]: 'warn'
    },
    facility: {
      [LOCAL0]: 'local0'
    },
    open: () => {},
    log: () => {}
  });

  const deepContext = () => ({
    level1: {
      level2: {
        level3: {
          level4: {
            level5: {
              level6: 'world'
            }
          }
        }
      }
    }
  });

  it('it should fail at serializing deep object', () => {
    const syslog = makeSyslog();
    const spy = sinon.spy(syslog, 'log');
    // test with default options
    const sender1 = new SyslogSender([], 'test-sender', {}, LOCAL0, syslog);
    sender1.send(logLevelWarn, 'hello', deepContext());
    assert.equal(true, spy.calledOnce);
    assert.equal(false, spy.calledWithMatch(logLevelWarn, /world/));
    assert.equal(true, spy.calledWithMatch(logLevelWarn, /\[Object\]/));
  });

  it('it should serialize deep object', () => {
    const syslog = makeSyslog();
    const spy = sinon.spy(syslog, 'log');
    // test with custom options (depth = 10)
    const sender2 = new SyslogSender([], 'test-sender', {}, LOCAL0, syslog, { depth: 10 });
    sender2.send(logLevelWarn, 'hello', deepContext());
    assert.equal(true, spy.calledOnce);
    assert.equal(true, spy.calledWithMatch(logLevelWarn, /world/));
    assert.equal(false, spy.calledWithMatch(logLevelWarn, /\[Object\]/));
  });
}

describe("Unit", () => {
  describe("Logger", function () {
    "use strict";
    describe("validate log levels", testLogLevels);
    describe("logging does not modify context", testImmutableContext);
  });
  describe("ServerLogger", function () {
    "use strict";
    describe("objectifyContext()", testObjectifyContext);
    describe("stringifyMessage", testStringifyMessage);
    describe("serializeDeepObject", testSerializeDeepObject);
  });
  describe("MongoDbSender", testMongoDbSender);
});
