// Simple presence store exported for both socket server and controllers
// userId (string) -> Set of socketIds
const onlineUsers = new Map();

function addSocketForUser(userId, socketId) {
  userId = String(userId);
  const set = onlineUsers.get(userId) || new Set();
  set.add(socketId);
  onlineUsers.set(userId, set);
}
function removeSocketForUser(userId, socketId) {
  userId = String(userId);
  const set = onlineUsers.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) onlineUsers.delete(userId);
  else onlineUsers.set(userId, set);
}
function isUserOnline(userId) {
  return onlineUsers.has(String(userId));
}
function getSocketIds(userId) {
  const set = onlineUsers.get(String(userId));
  return set ? Array.from(set) : [];
}

module.exports = {
  onlineUsers,
  addSocketForUser,
  removeSocketForUser,
  isUserOnline,
  getSocketIds,
};
