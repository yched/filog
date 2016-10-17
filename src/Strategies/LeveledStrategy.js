import StrategyBase from './StrategyBase';
import LogLevel from '../LogLevel';
import SenderBase from '../Senders/SenderBase';

/**
 * As a start, we only have a trivial level-based strategy with a single
 * sender per level.
 */
export default class LeveledStrategy extends StrategyBase {
  /**
   * @constructor
   *
   * @param {function} low
   *   The Sender to use for low-interest events.
   * @param {function} medium
   *   The Sender to use for medium-interest events.
   * @param {function} high
   *   The Sender to use for high-interest events.
   * @param {int} minLow
   *   The minimum level to handle as a low-interest event.
   * @param {int} maxHigh
   *   The maximum level to handle as a high-interest event.
   */
  constructor(low, medium, high, minLow = LogLevel.DEBUG, maxHigh = LogLevel.WARNING) {
    // Do not initialize a default null sender.
    super(false);

    this.low = low;
    this.medium = medium;
    this.high = high;
    this.minLow = minLow;
    this.maxHigh = maxHigh;

    [low, medium, high].forEach(sender => {
      if (!sender instanceof SenderBase) {
        throw new Error('LeveledStrategy: senders must be instances of a Sender class.');
      }
    });
  }

  /** @inheritdoc */
  selectSenders(level) {
    let sender;
    if (level >= this.minLow) {
      sender = this.low;
    }
    else if (level <= this.maxHigh) {
      sender = this.high;
    }
    else {
      sender = this.medium;
    }

    return [sender];
  }
}