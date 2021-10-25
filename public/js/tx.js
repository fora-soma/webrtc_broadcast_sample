const localVideo = document.getElementById("local-video");
let localStream = null;
const mediaConstraints = {
  mandatory: { OfferToReceiveAudio: false, OfferToReceiveVideo: false },
};

function isLocalStreamStarted() {
  if (localStream) {
    return true;
  } else {
    return false;
  }
}

// -------------- multi connections --------------------
var MAX_CONNECTION_COUNT = 10;
var connections = {}; // Connection hash
class Connection {
  // Connection Class
  constructor(id, peer) {
    this.id = id; // socket.id of partner
    this.peerConnection = peer; // RTCPeerConnection instance
  }
}

function getConnection(id) {
  var con = null;
  con = connections[id];
  return con;
}

function addConnection(id, connection) {
  connections[id] = connection;
}

function getConnectionCount() {
  var count = 0;
  for (var id in connections) {
    count++;
  }

  console.log("getConnectionCount=" + count);
  return count;
}

function isConnectPossible() {
  if (getConnectionCount() < MAX_CONNECTION_COUNT) return true;
  else return false;
}

function getConnectionIndex(id_to_lookup) {
  var index = 0;
  for (var id in connections) {
    if (id == id_to_lookup) {
      return index;
    }

    index++;
  }

  // not found
  return -1;
}

function deleteConnection(id) {
  delete connections[id];
}

function stopAllConnections() {
  for (var id in connections) {
    var conn = connections[id];
    conn.peerConnection.close();
    conn.peerConnection = null;
    delete connections[id];
  }
}

function stopConnection(id) {
  var conn = connections[id];
  if (conn) {
    console.log("stop and delete connection with id=" + id);
    conn.peerConnection.close();
    conn.peerConnection = null;
    delete connections[id];
  } else {
    console.log("try to stop connection, but not found id=" + id);
  }
}

function isPeerStarted() {
  if (getConnectionCount() > 0) {
    return true;
  } else {
    return false;
  }
}

// ---- socket ------
// create socket
var socketReady = false;
var port = 9001;
var socket = io.connect("http://localhost:" + port + "/"); // ※自分のシグナリングサーバーに合わせて変更してください

// socket: channel connected
socket
  .on("connect", onOpened)
  .on("message", onMessage)
  .on("user disconnected", onUserDisconnect);

function onOpened(evt) {
  console.log("socket opened.");
  socketReady = true;

  var roomName = getRoomName(); // 会議室名を取得する
  socket.emit("enter", roomName);
  console.log("enter to " + roomName);
}

// socket: accept connection request
function onMessage(evt) {
  var id = evt.from;
  var target = evt.sendto;
  var conn = getConnection(id);

  if (evt.type === "talk_request") {
    if (!isLocalStreamStarted()) {
      console.warn("local stream not started. ignore request");
      return;
    }

    console.log("receive request, start offer.");
    sendOffer(id);
    return;
  } else if (evt.type === "answer" && isPeerStarted()) {
    console.log("Received answer, setting answer SDP");
    onAnswer(evt);
  } else if (evt.type === "candidate" && isPeerStarted()) {
    console.log("Received ICE candidate...");
    onCandidate(evt);
  } else if (evt.type === "bye") {
    console.log("got bye.");
    stopConnection(id);
  }
}

function onUserDisconnect(evt) {
  console.log("disconnected");
  if (evt) {
    stopConnection(evt.id);
  }
}

function getRoomName() {
  // たとえば、 URLに  ?roomName  とする
  var url = document.location.href;
  var args = url.split("?");
  if (args.length > 1) {
    var room = args[1];
    if (room != "") {
      return room;
    }
  }
  return "_defaultRoom";
}

function onAnswer(evt) {
  console.log("Received Answer...");
  console.log(evt);
  setAnswer(evt);
}

function onCandidate(evt) {
  var id = evt.from;
  var conn = getConnection(id);
  if (!conn) {
    console.error("peerConnection not exist!");
    return;
  }

  var candidate = new RTCIceCandidate({
    sdpMLineIndex: evt.sdpMLineIndex,
    sdpMid: evt.sdpMid,
    candidate: evt.candidate,
  });
  console.log("Received Candidate...");
  console.log(candidate);
  conn.peerConnection.addIceCandidate(candidate);
}

function sendSDP(sdp) {
  var text = JSON.stringify(sdp);
  console.log("---sending sdp text ---");
  console.log(text);

  // send via socket
  socket.emit("message", sdp);
}

function sendCandidate(candidate) {
  var text = JSON.stringify(candidate);
  console.log("---sending candidate text ---");
  console.log(text);

  // send via socket
  socket.emit("message", candidate);
}

// ---------------------- video handling -----------------------
// start local video
function startVideo() {
  const constraints = { video: true, audio: true };
  navigator.mediaDevices
    .getUserMedia(constraints)
    .then(function (stream) {
      // success
      window.stream = stream; // make variable available to browser console
      localVideo.srcObject = stream;

      localStream = stream;

      // auto start
      tellReady();
    })
    .catch(function (error) {
      // error
      console.error("An error occurred:");
      console.error(error);
      return;
    });
}

// stop local video
function stopVideo() {
  hangUp();

  localVideo.src = "";
  localStream.getTracks().forEach((track) => track.stop());
  localStream = null;
}

// ---------------------- connection handling -----------------------
function prepareNewConnection(id) {
  var pc_config = { iceServers: [] };
  var peer = null;
  try {
    peer = new webkitRTCPeerConnection(pc_config);
  } catch (e) {
    console.log("Failed to create PeerConnection, exception: " + e.message);
  }
  var conn = new Connection(id, peer);
  peer.id = id;
  addConnection(id, conn);

  // send any ice candidates to the other peer
  peer.onicecandidate = function (evt) {
    if (evt.candidate) {
      console.log(evt.candidate);
      sendCandidate({
        type: "candidate",
        sendto: conn.id,
        sdpMLineIndex: evt.candidate.sdpMLineIndex,
        sdpMid: evt.candidate.sdpMid,
        candidate: evt.candidate.candidate,
      });
    } else {
      console.log("ICE event. phase=" + evt.eventPhase);
      //conn.established = true;
    }
  };

  console.log("Adding local stream...");
  peer.addStream(localStream);

  return conn;
}

function sendOffer(id) {
  var conn = getConnection(id);
  if (!conn) {
    conn = prepareNewConnection(id);
  }

  conn.peerConnection.createOffer(
    function (sessionDescription) {
      // in case of success
      conn.peerConnection.setLocalDescription(sessionDescription);
      sessionDescription.sendto = id;
      sendSDP(sessionDescription);
    },
    function () {
      // in case of error
      console.log("Create Offer failed");
    },
    mediaConstraints
  );
}

function setAnswer(evt) {
  var id = evt.from;
  var conn = getConnection(id);
  if (!conn) {
    console.error("peerConnection not exist!");
    return;
  }
  conn.peerConnection.setRemoteDescription(new RTCSessionDescription(evt));
}

// -------- handling user UI event -----
function tellReady() {
  if (!isLocalStreamStarted()) {
    alert(
      "Local stream not running yet. Please [Start Video] or [Start Screen]."
    );
    return;
  }
  if (!socketReady) {
    alert("Socket is not connected to server. Please reload and try again.");
    return;
  }

  // call others, in same room
  console.log("tell ready to others in same room, before offer");
  socket.emit("message", { type: "talk_ready" });
}

// stop the connection upon user request
function hangUp() {
  console.log("Hang up.");
  socket.emit("message", { type: "end_talk" });
  stopAllConnections();
}
