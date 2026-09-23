type TopicPreview = { topicState: "not_generated" | "candidate" | "withheld"; topics: { id: string; label: string }[] };
export function matchesTopicFilter(item: TopicPreview, filter: string) {
  if (!filter) return true;
  if (filter === "__not_generated") return item.topicState === "not_generated";
  if (filter === "__withheld") return item.topicState === "withheld";
  return item.topicState === "candidate" && item.topics.some((topic) => topic.id === filter);
}
