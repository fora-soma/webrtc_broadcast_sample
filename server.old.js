/**
 * シグナリングサーバー（WebSocketサーバー） + Webサーバー
 */
const BROADCAST_ID = "_broadcast_";

// Express
const express = require("express");
const app = express();

// publicディレクトリを公開
app.use(express.static(__dirname + "/public"));

const http = require("http");
const server = http.createServer(app);

// WebSocketサーバーにはsocket.ioを採用
const io = require("socket.io")(server);

// -- create the socket server on the port ---
var port = 9001;
server.listen(port);
console.log("signaling server started on port:" + port);

// This callback function is called every time a socket
// tries to connect to the server
io.on("connection", (socket) => {
  // ---- multi room ----
  socket.on("enter", function (roomName) {
    socket.join(roomName);
    console.log("id=" + socket.id + " enter room=" + roomName);
    setRoomName(roomName);
  });

  function setRoomName(room) {
    //// for v0.9
    //socket.set('roomName', room);

    // for v1.0
    socket.roomName = room;
  }

  function getRoomName() {
    var room = null;

    //// for v0.9
    //socket.get('roomName', function(err, _room) {
    //  room = _room;
    //});

    // for v1.0
    room = socket.roomName;

    return room;
  }

  function emitMessage(type, message) {
    // ----- multi room ----
    var roomName = getRoomName();

    if (roomName) {
      console.log("===== message broadcast to room -->" + roomName);
      socket.broadcast.to(roomName).emit(type, message);
    } else {
      console.log("===== message broadcast all");
      socket.broadcast.emit(type, message);
    }
  }

  // When a user send a SDP message
  // broadcast to all users in the room
  socket.on("message", function (message) {
    message.from = socket.id;

    // get send target
    var target = message.sendTo;
    if (target && target != BROADCAST_ID) {
      console.log("===== message emit to -->" + target);
      socket.to(target).emit("message", message);
      return;
    }
    // broadcast in room
    emitMessage("message", message);
  });

  // When the user hangs up
  // broadcast bye signal to all users in the room
  socket.on("disconnect", function () {
    console.log("-- user disconnect: " + socket.id);
    // --- emit ----
    emitMessage("user disconnected", { id: socket.id });

    // --- leave room --
    var roomName = getRoomName();
    if (roomName) {
      socket.leave(roomName);
    }
  });
});
