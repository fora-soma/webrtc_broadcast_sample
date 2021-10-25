// const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");
// let localStream = null;
const mediaConstraints = {
  mandatory: { OfferToReceiveAudio: false, OfferToReceiveVideo: false },
};

function detachVideo(id) {
  if (id) {
    var conn = getConnection(id);
    if (conn) {
      remoteVideo.pause();
      remoteVideo.src = "";
    }
  } else {
    // force detach
    remoteVideo.pause();
    remoteVideo.src = "";
  }
}

function resizeRemoteVideo() {
  console.log("--resize--");
  var top_margin = 40;
  var left_margin = 20;
  var video_margin = 10;

  var new_width = window.innerWidth - left_margin - video_margin;
  var new_height = window.innerHeight - top_margin - video_margin;
  remoteVideo.style.width = new_width + "px";
  remoteVideo.style.height = new_height + "px";
  remoteVideo.style.top = top_margin + "px";
  remoteVideo.style.left = left_margin + "px";
}
document.body.onresize = resizeRemoteVideo;
resizeRemoteVideo();

// -------------- multi connections --------------------
var MAX_CONNECTION_COUNT = 1;
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
  var target = evt.sendTo;
  var conn = getConnection(id);

  console.log("onMessage() evt.type=" + evt.type);

  if (evt.type === "talk_ready") {
    if (conn) {
      return; // already connected
    }

    if (isConnectPossible()) {
      socket.emit("message", { type: "talk_request", sendTo: id });
    } else {
      console.warn("max connections. so ignore call");
    }
    return;
  } else if (evt.type === "offer") {
    console.log("Received offer, set offer, sending answer....");
    onOffer(evt);
  } else if (evt.type === "candidate" && isPeerStarted()) {
    console.log("Received ICE candidate...");
    onCandidate(evt);
  } else if (evt.type === "end_talk") {
    console.log("got talker bye.");
    detachVideo(id); // force detach video
    stopConnection(id);
  }
}

function onUserDisconnect(evt) {
  console.log("disconnected");
  if (evt) {
    detachVideo(evt.id); // force detach video
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

function onOffer(evt) {
  console.log("Received offer...");
  console.log(evt);
  setOffer(evt);
  sendAnswer(evt);
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
        sendTo: conn.id,
        sdpMLineIndex: evt.candidate.sdpMLineIndex,
        sdpMid: evt.candidate.sdpMid,
        candidate: evt.candidate.candidate,
      });
    } else {
      console.log("on ice event. phase=" + evt.eventPhase);
    }
  };

  //console.log('Adding local stream...');
  //peer.addStream(localStream);

  peer.addEventListener("addstream", onRemoteStreamAdded, false);
  peer.addEventListener("removestream", onRemoteStreamRemoved, false);

  // when remote adds a stream, hand it on to the local video element
  function onRemoteStreamAdded(event) {
    console.log("Added remote stream");
    //attachVideo(this.id, event.stream);
    remoteVideo.srcObject = event.stream;
  }

  // when remote removes a stream, remove it from the local video element
  function onRemoteStreamRemoved(event) {
    console.log("Remove remote stream");
    detachVideo(this.id);
  }

  return conn;
}

function setOffer(evt) {
  var id = evt.from;
  var conn = getConnection(id);
  if (!conn) {
    conn = prepareNewConnection(id);
    conn.peerConnection.setRemoteDescription(new RTCSessionDescription(evt));
  } else {
    console.error("peerConnection already exist!");
  }
}

function sendAnswer(evt) {
  console.log("sending Answer. Creating remote session description...");
  var id = evt.from;
  var conn = getConnection(id);
  if (!conn) {
    console.error("peerConnection not exist!");
    return;
  }

  conn.peerConnection.createAnswer(
    function (sessionDescription) {
      // in case of success
      conn.peerConnection.setLocalDescription(sessionDescription);
      sessionDescription.sendTo = id;
      sendSDP(sessionDescription);
    },
    function () {
      // in case of error
      console.log("Create Answer failed");
    },
    mediaConstraints
  );
}

function sendRequest() {
  if (!socketReady) {
    alert("Socket is not connected to server. Please reload and try again.");
    return;
  }

  // call others, in same room
  console.log("send request in same room, ask for offer");
  socket.emit("message", { type: "talk_request" });
}

// stop the connection upon user request
function hangUp() {
  console.log("Hang up.");
  socket.emit("message", { type: "bye" });
  detachVideo(null);
  stopAllConnections();
}
