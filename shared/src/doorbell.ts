// The names the "doorbell" uses, in one place so the backend (which rings) and the frontend
// (which listens) can never disagree. A ring is a tiny message through Supabase Realtime that
// carries no data, only "something changed here, ask the backend": every page then fetches what
// it is allowed to see through the normal routes, so each person's permissions still apply.
//
// A topic is the channel a page listens on. Each has a few events; a page treats them all the
// same, and the different names only make it easier to see what happened.
export const DOORBELL = {
  /** The posts feed. */
  feed: {
    topic: "feed",
    events: [
      "new-post",
      "post-changed", // edited or deleted
      "rsvp-changed", // someone answered or took back an RSVP (only the counts move)
    ],
  },
  /** The Votes page. */
  votes: {
    topic: "votes",
    events: [
      "vote-opened", // the Regent opened a vote
      "vote-answered", // a member answered or changed their answer (the counts moved)
      "vote-closed", // the Regent closed it and the result is saved
      "vote-deleted", // a vote was deleted (a redo), so the screen must drop it
      "vote-changed", // the headcount changed, or someone's right to vote was switched
    ],
  },
  /**
   * Roles and membership, for every signed-in app (it re-reads who it is signed in as).
   * A page must not share a topic with another listener open at the same time: they would share
   * one channel, and closing the page would hang up on the other listener too.
   */
  members: {
    topic: "members",
    events: ["member-changed"], // a role was granted or revoked, or a member was removed or erased
  },
  /** The Members page: any change to the list (added, roles, can vote, removed, first sign-in). */
  memberList: {
    topic: "member-list",
    events: ["list-changed"],
  },
  /** The Links page. */
  links: {
    topic: "links",
    events: ["links-changed"], // a link was added or removed
  },
} as const;

export type FeedEvent = (typeof DOORBELL.feed.events)[number];
export type VotesEvent = (typeof DOORBELL.votes.events)[number];
export type LinksEvent = (typeof DOORBELL.links.events)[number];
export type MemberListEvent = (typeof DOORBELL.memberList.events)[number];
export type MembersEvent = (typeof DOORBELL.members.events)[number];
