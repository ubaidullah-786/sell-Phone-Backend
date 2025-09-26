// routes/chatRoutes.js
const express = require('express');
const chatController = require('../controllers/chatController');
const authController = require('../controllers/authController');

const router = express.Router();

router.use(authController.protect); // all chat endpoints require auth

router.post('/start', chatController.startChat);
router.get('/my-chats', chatController.getMyChats);
router
  .route('/:chatId/messages')
  .get(chatController.getMessages)
  .post(chatController.sendMessage);

module.exports = router;
