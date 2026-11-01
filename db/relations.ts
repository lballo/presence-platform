import { relations } from "drizzle-orm";
import {
  members,
  invitations,
  forumPosts,
  forumSpaces,
  forumPostHashtags,
  hashtags,
  hives,
  hiveMembers,
  hivePosts,
  hiveResources,
  events,
  eventRegistrations,
  talks,
  speeches,
  speechScores,
  advice,
  coachingSessions,
  messages,
  forumReplies,
} from "./schema";

export const membersRelations = relations(members, ({ many }) => ({
  hiveMemberships: many(hiveMembers),
  coachingSessions: many(coachingSessions),
}));

export const coachingSessionsRelations = relations(coachingSessions, ({ one }) => ({
  member: one(members, { fields: [coachingSessions.memberId], references: [members.id] }),
}));

export const forumSpacesRelations = relations(forumSpaces, ({ many }) => ({
  posts: many(forumPosts),
}));

export const forumPostsRelations = relations(forumPosts, ({ one, many }) => ({
  author: one(members, { fields: [forumPosts.authorId], references: [members.id] }),
  space: one(forumSpaces, { fields: [forumPosts.spaceId], references: [forumSpaces.id] }),
  hive: one(hives, { fields: [forumPosts.hiveId], references: [hives.id] }),
  replyList: many(forumReplies),
  tags: many(forumPostHashtags),
}));

export const forumPostHashtagsRelations = relations(forumPostHashtags, ({ one }) => ({
  post: one(forumPosts, { fields: [forumPostHashtags.postId], references: [forumPosts.id] }),
  hashtag: one(hashtags, { fields: [forumPostHashtags.hashtagId], references: [hashtags.id] }),
}));

export const hashtagsRelations = relations(hashtags, ({ many }) => ({
  posts: many(forumPostHashtags),
}));

export const hivesRelations = relations(hives, ({ one, many }) => ({
  founder: one(members, { fields: [hives.founderId], references: [members.id] }),
  parent: one(hives, { fields: [hives.parentId], references: [hives.id], relationName: "children" }),
  children: many(hives, { relationName: "children" }),
  memberships: many(hiveMembers),
  posts: many(hivePosts),
  resources: many(hiveResources),
  events: many(events),
}));

export const hiveMembersRelations = relations(hiveMembers, ({ one }) => ({
  hive: one(hives, { fields: [hiveMembers.hiveId], references: [hives.id] }),
  member: one(members, { fields: [hiveMembers.memberId], references: [members.id] }),
}));

export const hivePostsRelations = relations(hivePosts, ({ one }) => ({
  hive: one(hives, { fields: [hivePosts.hiveId], references: [hives.id] }),
  author: one(members, { fields: [hivePosts.authorId], references: [members.id] }),
}));

export const hiveResourcesRelations = relations(hiveResources, ({ one }) => ({
  hive: one(hives, { fields: [hiveResources.hiveId], references: [hives.id] }),
  author: one(members, { fields: [hiveResources.authorId], references: [members.id] }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  host: one(members, { fields: [events.hostId], references: [members.id] }),
  hive: one(hives, { fields: [events.hiveId], references: [hives.id] }),
  registrations: many(eventRegistrations),
}));

export const eventRegistrationsRelations = relations(eventRegistrations, ({ one }) => ({
  event: one(events, { fields: [eventRegistrations.eventId], references: [events.id] }),
  member: one(members, { fields: [eventRegistrations.memberId], references: [members.id] }),
}));

export const talksRelations = relations(talks, ({ one }) => ({
  speaker: one(members, { fields: [talks.speakerId], references: [members.id] }),
}));

export const speechesRelations = relations(speeches, ({ many }) => ({
  scores: many(speechScores),
  advice: many(advice),
}));

export const speechScoresRelations = relations(speechScores, ({ one }) => ({
  speech: one(speeches, { fields: [speechScores.speechId], references: [speeches.id] }),
}));

export const adviceRelations = relations(advice, ({ one }) => ({
  speech: one(speeches, { fields: [advice.speechId], references: [speeches.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  from: one(members, { fields: [messages.fromId], references: [members.id], relationName: "sent" }),
  to: one(members, { fields: [messages.toId], references: [members.id], relationName: "received" }),
}));

export const forumRepliesRelations = relations(forumReplies, ({ one }) => ({
  post: one(forumPosts, { fields: [forumReplies.postId], references: [forumPosts.id] }),
  author: one(members, { fields: [forumReplies.authorId], references: [members.id] }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  member: one(members, { fields: [invitations.memberId], references: [members.id] }),
}));
