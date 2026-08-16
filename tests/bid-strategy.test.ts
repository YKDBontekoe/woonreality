import assert from "node:assert/strict";
import test from "node:test";
import { buildBidStrategy, negotiationGuidance } from "../src/lib/bid-strategy";

test("buildBidStrategy returns null for an invalid asking price", () => {
  assert.equal(buildBidStrategy(0), null);
  assert.equal(buildBidStrategy(-100), null);
});

test("buildBidStrategy keeps financingCondition true for first-time buyers even without risk signals", () => {
  const strategy = buildBidStrategy(400_000, { signals: [] } as never, { budget: 450_000, firstTimeBuyer: true, ownFunds: 20_000 });
  assert.ok(strategy);
  assert.equal(strategy!.scenarios.strong.financingCondition, true);
});

test("negotiationGuidance returns counter-offer steps, an escalation clause explainer, and a walk-away reminder", () => {
  const strategy = buildBidStrategy(400_000, null, { budget: 420_000, firstTimeBuyer: false, ownFunds: 20_000 });
  const guidance = negotiationGuidance(strategy, "balanced", 420_000);
  assert.ok(guidance.counterOfferSteps.length > 0);
  assert.match(guidance.escalationClause.title, /ophoogclausule/i);
  assert.match(guidance.walkAwayReminder, /420/);
});

test("negotiationGuidance still returns guidance when there is no strategy yet", () => {
  const guidance = negotiationGuidance(null, "balanced");
  assert.ok(guidance.counterOfferSteps.length > 0);
  assert.ok(guidance.walkAwayReminder.length > 0);
});
