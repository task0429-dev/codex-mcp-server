const assert = require("assert");
const path = require("path");

const serviceModule = require(path.join(__dirname, "..", "dist", "services", "conversation-intelligence-service.js"));

async function main() {
  const { ConversationIntelligenceService } = serviceModule;

  await ConversationIntelligenceService.syncSessions();
  const conversations = ConversationIntelligenceService.listConversations();

  assert.ok(conversations.length > 0, "Expected synced conversations to exist.");

  const candidate = conversations.find((conversation) => {
    if (conversation.segmentCount < 2) return false;
    const detail = ConversationIntelligenceService.getConversation(conversation.id);
    return Boolean(detail?.segments?.some((segment) =>
      (segment.assistantPlan && segment.assistantPlan.trim()) ||
      (segment.assistantResponseSummary && segment.assistantResponseSummary.trim()) ||
      segment.nextSteps.length ||
      segment.blockers.length
    ));
  });
  assert.ok(candidate, "Expected at least one conversation to be split into multiple segments.");

  const detail = ConversationIntelligenceService.getConversation(candidate.id);
  assert.ok(detail, "Expected structured detail for candidate conversation.");
  assert.ok(Array.isArray(detail.segments) && detail.segments.length >= 2, "Expected at least two extracted segments.");
  assert.ok(detail.segments.every((segment) => typeof segment.title === "string" && segment.title.trim()), "Each segment should have a title.");
  assert.ok(detail.segments.every((segment) => typeof segment.userRequest === "string" && segment.userRequest.trim()), "Each segment should preserve the user request.");
  assert.ok(detail.segments.some((segment) =>
    (segment.assistantPlan && segment.assistantPlan.trim()) ||
    (segment.assistantResponseSummary && segment.assistantResponseSummary.trim()) ||
    segment.nextSteps.length ||
    segment.blockers.length
  ), "Expected assistant plan, summary, blockers, or next-step content on extracted segments.");

  console.log(JSON.stringify({
    conversationId: candidate.id,
    title: candidate.title,
    segmentCount: detail.segments.length,
    statuses: detail.segments.map((segment) => segment.currentStatus),
  }, null, 2));
  console.log("Conversation intelligence verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
