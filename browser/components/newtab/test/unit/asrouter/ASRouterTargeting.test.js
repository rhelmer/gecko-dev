import {
  ASRouterTargeting,
  CachedTargetingGetter,
  getSortedMessages,
} from "lib/ASRouterTargeting.jsm";
import { OnboardingMessageProvider } from "lib/OnboardingMessageProvider.jsm";
import { ASRouterPreferences } from "lib/ASRouterPreferences.jsm";
import { GlobalOverrider } from "test/unit/utils";

// Note that tests for the ASRouterTargeting environment can be found in
// test/functional/mochitest/browser_asrouter_targeting.js

describe("#CachedTargetingGetter", () => {
  const sixHours = 6 * 60 * 60 * 1000;
  let sandbox;
  let clock;
  let frecentStub;
  let topsitesCache;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clock = sinon.useFakeTimers();
    frecentStub = sandbox.stub(
      global.NewTabUtils.activityStreamProvider,
      "getTopFrecentSites"
    );
    sandbox.stub(global.Cu, "reportError");
    topsitesCache = new CachedTargetingGetter("getTopFrecentSites");
  });

  afterEach(() => {
    sandbox.restore();
    clock.restore();
  });

  it("should only make a request every 6 hours", async () => {
    frecentStub.resolves();
    clock.tick(sixHours);

    await topsitesCache.get();
    await topsitesCache.get();

    assert.calledOnce(
      global.NewTabUtils.activityStreamProvider.getTopFrecentSites
    );

    clock.tick(sixHours);

    await topsitesCache.get();

    assert.calledTwice(
      global.NewTabUtils.activityStreamProvider.getTopFrecentSites
    );
  });
  it("throws when failing getter", async () => {
    frecentStub.rejects(new Error("fake error"));
    clock.tick(sixHours);

    // assert.throws expect a function as the first parameter, try/catch is a
    // workaround
    let rejected = false;
    try {
      await topsitesCache.get();
    } catch (e) {
      rejected = true;
    }

    assert(rejected);
  });
  it("should check targeted message before message without targeting", async () => {
    const messages = await OnboardingMessageProvider.getUntranslatedMessages();
    const stub = sandbox
      .stub(ASRouterTargeting, "checkMessageTargeting")
      .resolves();
    const context = {
      attributionData: {
        campaign: "non-fx-button",
        source: "addons.mozilla.org",
      },
    };
    await ASRouterTargeting.findMatchingMessage({
      messages,
      trigger: { id: "firstRun" },
      context,
    });

    const messageCount = messages.filter(
      message => message.trigger && message.trigger.id === "firstRun"
    ).length;

    assert.equal(stub.callCount, messageCount);
    const calls = stub.getCalls().map(call => call.args[0]);
    const lastCall = calls[calls.length - 1];
    assert.equal(lastCall.id, "TRAILHEAD_1");
  });
  describe("sortMessagesByPriority", () => {
    it("should sort messages in descending priority order", async () => {
      const [
        m1,
        m2,
        m3,
      ] = await OnboardingMessageProvider.getUntranslatedMessages();
      const checkMessageTargetingStub = sandbox
        .stub(ASRouterTargeting, "checkMessageTargeting")
        .resolves(false);
      sandbox.stub(ASRouterTargeting, "isTriggerMatch").resolves(true);

      await ASRouterTargeting.findMatchingMessage({
        messages: [
          { ...m1, priority: 0 },
          { ...m2, priority: 1 },
          { ...m3, priority: 2 },
        ],
        trigger: "testing",
      });

      assert.equal(checkMessageTargetingStub.callCount, 3);

      const [arg_m1] = checkMessageTargetingStub.firstCall.args;
      assert.equal(arg_m1.id, m3.id);

      const [arg_m2] = checkMessageTargetingStub.secondCall.args;
      assert.equal(arg_m2.id, m2.id);

      const [arg_m3] = checkMessageTargetingStub.thirdCall.args;
      assert.equal(arg_m3.id, m1.id);
    });
    it("should sort messages with no priority last", async () => {
      const [
        m1,
        m2,
        m3,
      ] = await OnboardingMessageProvider.getUntranslatedMessages();
      const checkMessageTargetingStub = sandbox
        .stub(ASRouterTargeting, "checkMessageTargeting")
        .resolves(false);
      sandbox.stub(ASRouterTargeting, "isTriggerMatch").resolves(true);

      await ASRouterTargeting.findMatchingMessage({
        messages: [
          { ...m1, priority: 0 },
          { ...m2, priority: undefined },
          { ...m3, priority: 2 },
        ],
        trigger: "testing",
      });

      assert.equal(checkMessageTargetingStub.callCount, 3);

      const [arg_m1] = checkMessageTargetingStub.firstCall.args;
      assert.equal(arg_m1.id, m3.id);

      const [arg_m2] = checkMessageTargetingStub.secondCall.args;
      assert.equal(arg_m2.id, m1.id);

      const [arg_m3] = checkMessageTargetingStub.thirdCall.args;
      assert.equal(arg_m3.id, m2.id);
    });
    it("should keep the order of messages with same priority unchanged", async () => {
      const [
        m1,
        m2,
        m3,
      ] = await OnboardingMessageProvider.getUntranslatedMessages();
      const checkMessageTargetingStub = sandbox
        .stub(ASRouterTargeting, "checkMessageTargeting")
        .resolves(false);
      sandbox.stub(ASRouterTargeting, "isTriggerMatch").resolves(true);

      await ASRouterTargeting.findMatchingMessage({
        messages: [
          { ...m1, priority: 2, targeting: undefined, rank: 1 },
          { ...m2, priority: undefined, targeting: undefined, rank: 1 },
          { ...m3, priority: 2, targeting: undefined, rank: 1 },
        ],
        trigger: "testing",
      });

      assert.equal(checkMessageTargetingStub.callCount, 3);

      const [arg_m1] = checkMessageTargetingStub.firstCall.args;
      assert.equal(arg_m1.id, m1.id);

      const [arg_m2] = checkMessageTargetingStub.secondCall.args;
      assert.equal(arg_m2.id, m3.id);

      const [arg_m3] = checkMessageTargetingStub.thirdCall.args;
      assert.equal(arg_m3.id, m2.id);
    });
  });
  describe("combineContexts", () => {
    it("should combine the properties of the two objects", () => {
      const joined = ASRouterTargeting.combineContexts(
        {
          get foo() {
            return "foo";
          },
        },
        {
          get bar() {
            return "bar";
          },
        }
      );
      assert.propertyVal(joined, "foo", "foo");
      assert.propertyVal(joined, "bar", "bar");
    });
    it("should warn when properties overlap", () => {
      ASRouterTargeting.combineContexts(
        {
          get foo() {
            return "foo";
          },
        },
        {
          get foo() {
            return "bar";
          },
        }
      );
      assert.calledOnce(global.Cu.reportError);
    });
  });
});
describe("ASRouterTargeting", () => {
  let evalStub;
  let sandbox;
  let clock;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    evalStub = sandbox.stub(global.FilterExpressions, "eval");
    sandbox.replace(ASRouterTargeting, "Environment", {});
    clock = sinon.useFakeTimers();
  });
  afterEach(() => {
    clock.restore();
    sandbox.restore();
  });
  it("should cache evaluation result", async () => {
    evalStub.resolves(true);

    await ASRouterTargeting.checkMessageTargeting(
      { targeting: "jexl1" },
      {},
      sandbox.stub(),
      true
    );
    await ASRouterTargeting.checkMessageTargeting(
      { targeting: "jexl2" },
      {},
      sandbox.stub(),
      true
    );
    await ASRouterTargeting.checkMessageTargeting(
      { targeting: "jexl1" },
      {},
      sandbox.stub(),
      true
    );

    assert.calledTwice(evalStub);
  });
  it("should not cache evaluation result", async () => {
    evalStub.resolves(true);

    await ASRouterTargeting.checkMessageTargeting(
      { targeting: "jexl" },
      {},
      sandbox.stub(),
      false
    );
    await ASRouterTargeting.checkMessageTargeting(
      { targeting: "jexl" },
      {},
      sandbox.stub(),
      false
    );
    await ASRouterTargeting.checkMessageTargeting(
      { targeting: "jexl" },
      {},
      sandbox.stub(),
      false
    );

    assert.calledThrice(evalStub);
  });
  it("should expire cache entries", async () => {
    evalStub.resolves(true);

    await ASRouterTargeting.checkMessageTargeting(
      { targeting: "jexl" },
      {},
      sandbox.stub(),
      true
    );
    await ASRouterTargeting.checkMessageTargeting(
      { targeting: "jexl" },
      {},
      sandbox.stub(),
      true
    );
    clock.tick(60 * 1000 + 1);
    await ASRouterTargeting.checkMessageTargeting(
      { targeting: "jexl" },
      {},
      sandbox.stub(),
      true
    );

    assert.calledTwice(evalStub);
  });
});

/**
 * Messages should be sorted in the following order:
 * 1. Rank
 * 2. Priority
 * 3. If the message has targeting
 * 4. Order or randomization, depending on input
 */
describe("getSortedMessages", () => {
  let globals = new GlobalOverrider();
  let sandbox;
  let thresholdStub;
  beforeEach(() => {
    globals.set({ ASRouterPreferences });
    sandbox = sinon.createSandbox();
    thresholdStub = sandbox.stub();
    sandbox.replaceGetter(
      ASRouterPreferences,
      "personalizedCfrThreshold",
      thresholdStub
    );
  });
  afterEach(() => {
    sandbox.restore();
    globals.restore();
  });

  /**
   * assertSortsCorrectly - Tests to see if an array, when sorted with getSortedMessages,
   *                        returns the items in the expected order.
   *
   * @param {Message[]} expectedOrderArray - The array of messages in its expected order
   * @param {{}} options - The options param for getSortedMessages
   * @returns
   */
  function assertSortsCorrectly(expectedOrderArray, options) {
    const input = [...expectedOrderArray].reverse();
    const result = getSortedMessages(input, options);
    const indexes = result.map(message => expectedOrderArray.indexOf(message));
    return assert.equal(
      indexes.join(","),
      [...expectedOrderArray.keys()].join(","),
      "Messsages are out of order"
    );
  }

  it("should sort messages by priority, then by targeting", () => {
    assertSortsCorrectly([
      { priority: 100, targeting: "isFoo" },
      { priority: 100 },
      { priority: 99 },
      { priority: 1, targeting: "isFoo" },
      { priority: 1 },
      {},
    ]);
  });
  it("should sort messages by score first if defined", () => {
    assertSortsCorrectly([
      { score: 7001 },
      { score: 7000, priority: 1 },
      { score: 7000, targeting: "isFoo" },
      { score: 7000 },
      { score: 6000, priority: 1000 },
      { priority: 99999 },
      {},
    ]);
  });
  it("should sort messages by priority, then targeting, then order if ordered param is true", () => {
    assertSortsCorrectly(
      [
        { priority: 100, order: 4 },
        { priority: 100, order: 5 },
        { priority: 1, order: 3, targeting: "isFoo" },
        { priority: 1, order: 0 },
        { priority: 1, order: 1 },
        { priority: 1, order: 2 },
        { order: 0 },
      ],
      { ordered: true }
    );
  });
  it("should filter messages below the personalizedCfrThreshold", () => {
    thresholdStub.returns(5000);
    const result = getSortedMessages([{ score: 5000 }, { score: 4999 }, {}]);
    assert.deepEqual(result, [{ score: 5000 }, {}]);
  });
  it("should not filter out messages without a score", () => {
    thresholdStub.returns(5000);
    const result = getSortedMessages([{ score: 4999 }, { id: "FOO" }]);
    assert.deepEqual(result, [{ id: "FOO" }]);
  });
  it("should not apply filter if the threshold is an invalid value", () => {
    let result;

    thresholdStub.returns(undefined);
    result = getSortedMessages([{ score: 5000 }, { score: 4999 }]);
    assert.deepEqual(result, [{ score: 5000 }, { score: 4999 }]);

    thresholdStub.returns("foo");
    result = getSortedMessages([{ score: 5000 }, { score: 4999 }]);
    assert.deepEqual(result, [{ score: 5000 }, { score: 4999 }]);

    thresholdStub.returns(5000);
    result = getSortedMessages([{ score: 5000 }, { score: 4999 }]);
    assert.deepEqual(result, [{ score: 5000 }]);
  });
});
