/**
 * TradingStrategy interface + example implementations.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO SWAP IN YOUR OWN MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Create a class that implements TradingStrategy
 * 2. In your analyze() method, call your LLM / algorithm with the MarketData
 * 3. Return a TradeDecision — the rest of the agent picks it up automatically
 *
 * Example with Claude:
 *   import Anthropic from "@anthropic-ai/sdk";
 *   class ClaudeStrategy implements TradingStrategy { ... }
 *
 * Example with Groq:
 *   import Groq from "groq-sdk";
 *   class GroqStrategy implements TradingStrategy { ... }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { MarketData, TradeDecision, TradingStrategy } from "../types/index";

// ─────────────────────────────────────────────────────────────────────────────
// Simple momentum strategy (no LLM — good for testing the template)
// ─────────────────────────────────────────────────────────────────────────────

export class MomentumStrategy implements TradingStrategy {
  private priceHistory: number[] = [];
  private readonly windowSize: number;
  private readonly tradeAmountUsd: number;

  constructor(windowSize = 5, tradeAmountUsd = 100) {
    this.windowSize = windowSize;
    this.tradeAmountUsd = tradeAmountUsd;
  }

  async analyze(data: MarketData): Promise<TradeDecision> {
    this.priceHistory.push(data.price);
    if (this.priceHistory.length > this.windowSize) {
      this.priceHistory.shift();
    }

    if (this.priceHistory.length < this.windowSize) {
      return {
        action: "HOLD",
        asset: data.pair.replace("USD", ""),
        pair: data.pair,
        amount: 0,
        confidence: 0.5,
        reasoning: `Warming up: have ${this.priceHistory.length}/${this.windowSize} price samples. Holding.`,
      };
    }

    const first = this.priceHistory[0];
    const last = this.priceHistory[this.priceHistory.length - 1];
    const changePct = ((last - first) / first) * 100;
    const spread = ((data.ask - data.bid) / data.price) * 100;

    let action: TradeDecision["action"] = "HOLD";
    let confidence = 0.5;
    let reasoning = "";

    if (changePct > 0.5 && spread < 0.1) {
      action = "BUY";
      confidence = Math.min(0.9, 0.5 + Math.abs(changePct) / 10);
      reasoning = `Upward momentum: price rose ${changePct.toFixed(2)}% over last ${this.windowSize} ticks. Spread is tight at ${spread.toFixed(3)}%. Buying.`;
    } else if (changePct < -0.5) {
      action = "SELL";
      confidence = Math.min(0.9, 0.5 + Math.abs(changePct) / 10);
      reasoning = `Downward momentum: price fell ${Math.abs(changePct).toFixed(2)}% over last ${this.windowSize} ticks. Selling to avoid further loss.`;
    } else {
      reasoning = `No clear momentum (${changePct.toFixed(2)}% change). Holding current position.`;
    }

    return {
      action,
      asset: data.pair.replace("USD", ""),
      pair: data.pair,
      amount: action === "HOLD" ? 0 : this.tradeAmountUsd,
      confidence,
      reasoning,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM-backed strategy stub — replace the body of analyze() with your model call
// ─────────────────────────────────────────────────────────────────────────────

export class LLMStrategy implements TradingStrategy {
  // Add your LLM client here, e.g.:
  // private client: Anthropic;
  // constructor() { this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); }

  async analyze(data: MarketData): Promise<TradeDecision> {
    // ── REPLACE THIS with your actual LLM call ────────────────────────────
    //
    // const response = await this.client.messages.create({
    //   model: "claude-sonnet-4-6",
    //   max_tokens: 500,
    //   messages: [{
    //     role: "user",
    //     content: `You are a crypto trading agent. Here is the current market data:
    //       Pair: ${data.pair}
    //       Price: $${data.price}
    //       24h High: $${data.high}, Low: $${data.low}
    //       Volume: ${data.volume}
    //       VWAP: $${data.vwap}
    //
    //       Respond with JSON: { action: "BUY"|"SELL"|"HOLD", amount: number, confidence: 0-1, reasoning: string }`
    //   }]
    // });
    // const parsed = JSON.parse(response.content[0].text);
    // return { ...parsed, asset: "BTC", pair: data.pair };
    //
    // ─────────────────────────────────────────────────────────────────────

    // Stub: always HOLD until you wire in your model
    return {
      action: "HOLD",
      asset: data.pair.replace("USD", ""),
      pair: data.pair,
      amount: 0,
      confidence: 0.5,
      reasoning: "LLMStrategy stub — wire in your model in src/agent/strategy.ts",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hybrid Trading Strategy — combining momentum, trend, RSI, and risk management
// ─────────────────────────────────────────────────────────────────────────────

export class HybridStrategy implements TradingStrategy {
  /**
   * Hybrid trading strategy combining momentum, trend, RSI, and risk management.
   *
   * Strategy Logic:
   * - Uses recent price history to compute momentum and moving average (trend)
   * - Uses RSI to avoid overbought/oversold entries
   * - Uses spread to filter out illiquid market conditions
   *
   * Entry (BUY):
   * - Positive momentum
   * - Price above moving average (uptrend)
   * - RSI below 70 (not overbought)
   * - Tight spread
   * - No open position
   *
   * Exit (SELL):
   * - Negative momentum OR weakening trend
   * - RSI indicates overbought reversal
   * - Stop-loss triggered (e.g., -2%)
   * - Take-profit triggered (e.g., +3%)
   *
   * Risk Management:
   * - Tracks last buy price
   * - Applies fixed stop-loss and take-profit thresholds
   *
   * Behavior:
   * - Avoids trading in unclear conditions (returns HOLD)
   * - Prioritizes capital preservation over frequent trades
  */
 
  private priceHistory: number[] = [];
  private readonly windowSize: number;
  private readonly tradeAmountUsd: number;

  // Risk config
  private readonly stopLossPct = 2;     // 2% loss
  private readonly takeProfitPct = 3;   // 3% gain

  // Track last buy price (simple state)
  private lastBuyPrice: number | null = null;

  constructor(windowSize = 14, tradeAmountUsd = 100) {
    this.windowSize = windowSize;
    this.tradeAmountUsd = tradeAmountUsd;
  }

  async analyze(data: MarketData): Promise<TradeDecision> {
    this.priceHistory.push(data.price);
    if (this.priceHistory.length > this.windowSize) {
      this.priceHistory.shift();
    }

    if (this.priceHistory.length < this.windowSize) {
      return this.hold(data, "Warming up...");
    }

    const price = data.price;

    // ─────────────────────────────────────────────
    // Indicators
    // ─────────────────────────────────────────────

    // Momentum
    const first = this.priceHistory[0];
    const last = this.priceHistory[this.priceHistory.length - 1];
    const changePct = ((last - first) / first) * 100;

    // Moving Average
    const avg =
      this.priceHistory.reduce((sum, p) => sum + p, 0) /
      this.priceHistory.length;

    // Spread
    const spread = ((data.ask - data.bid) / price) * 100;

    // RSI
    const rsi = this.calculateRSI(this.priceHistory);

    // ─────────────────────────────────────────────
    // Risk Management (if already in position)
    // ─────────────────────────────────────────────

    if (this.lastBuyPrice !== null) {
      const pnlPct = ((price - this.lastBuyPrice) / this.lastBuyPrice) * 100;

      if (pnlPct <= -this.stopLossPct) {
        this.lastBuyPrice = null;
        return this.sell(data, 0.9, `Stop loss hit (${pnlPct.toFixed(2)}%)`);
      }

      if (pnlPct >= this.takeProfitPct) {
        this.lastBuyPrice = null;
        return this.sell(data, 0.9, `Take profit hit (${pnlPct.toFixed(2)}%)`);
      }
    }

    // ─────────────────────────────────────────────
    // Entry Logic (Hybrid)
    // ─────────────────────────────────────────────

    let action: TradeDecision["action"] = "HOLD";
    let confidence = 0.5;
    let reasoning = "";

    const isUptrend = price > avg;
    const isDowntrend = price < avg;

    // BUY CONDITIONS
    if (
      changePct > 0.5 &&         // momentum up
      isUptrend &&               // above MA
      rsi < 70 &&                // not overbought
      spread < 0.1 &&            // tight spread
      this.lastBuyPrice === null // no open position
    ) {
      action = "BUY";
      confidence = 0.7 + Math.min(0.2, changePct / 10);
      reasoning = `BUY: Momentum ${changePct.toFixed(
        2
      )}%, price above MA, RSI ${rsi.toFixed(1)}, spread ${spread.toFixed(3)}%`;

      this.lastBuyPrice = price;
    }

    // SELL CONDITIONS
    else if (
      changePct < -0.5 ||        // momentum down
      (rsi > 70 && isDowntrend)  // overbought reversal
    ) {
      action = "SELL";
      confidence = 0.7;
      reasoning = `SELL: Momentum ${changePct.toFixed(
        2
      )}%, RSI ${rsi.toFixed(1)}, trend weakening`;

      this.lastBuyPrice = null;
    } else {
      reasoning = `HOLD: No strong signal | Momentum ${changePct.toFixed(
        2
      )}%, RSI ${rsi.toFixed(1)}, spread ${spread.toFixed(3)}%`;
    }

    return {
      action,
      asset: data.pair.replace("USD", ""),
      pair: data.pair,
      amount: action === "HOLD" ? 0 : this.tradeAmountUsd,
      confidence,
      reasoning,
    };
  }

  // ─────────────────────────────────────────────
  // RSI Calculation
  // ─────────────────────────────────────────────

  private calculateRSI(prices: number[]): number {
    let gains = 0;
    let losses = 0;

    for (let i = 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }

    if (losses === 0) return 100;

    const rs = gains / losses;
    return 100 - 100 / (1 + rs);
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  private hold(data: MarketData, reason: string): TradeDecision {
    return {
      action: "HOLD",
      asset: data.pair.replace("USD", ""),
      pair: data.pair,
      amount: 0,
      confidence: 0.5,
      reasoning: reason,
    };
  }

  private buy(data: MarketData, confidence: number, reason: string): TradeDecision {
    return {
      action: "BUY",
      asset: data.pair.replace("USD", ""),
      pair: data.pair,
      amount: this.tradeAmountUsd,
      confidence,
      reasoning: reason,
    };
  }

  private sell(data: MarketData, confidence: number, reason: string): TradeDecision {
    return {
      action: "SELL",
      asset: data.pair.replace("USD", ""),
      pair: data.pair,
      amount: this.tradeAmountUsd,
      confidence,
      reasoning: reason,
    };
  }
}
