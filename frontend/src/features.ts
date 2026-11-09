// Switches for which parts of the app members can see.
//
// VOTING_ONLY: only voting is shown (the Votes page, plus Admin for officers). The Home, Posts
// and Links screens are hidden and their addresses lead to Votes. This is for meetings where
// the chapter uses the app only to vote. Set it to false and deploy to bring everything back.
// It only changes what the screens show: the backend still enforces every permission.
export const VOTING_ONLY = false;
