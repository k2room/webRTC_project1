mdc.ripple.MDCRipple.attachTo(document.querySelector(".mdc-button"));

const configuration12 = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

const configuration23 = {
  iceServers: [
    {
      urls: ["stun:stun2.l.google.com:19302", "stun:stun3.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

const configuration31 = {
  iceServers: [
    {
      urls: ["stun:stun3.l.google.com:19302", "stun:stun1.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

let peerConnection12 = null;
let peerConnection23 = null;
let peerConnection31 = null;
let localStream = null;
let remoteStreamA = null;
let remoteStreamB = null;
let roomDialog = null;
let roomId = null;
let exists2 = false;

function init() {
  document.querySelector("#cameraBtn").addEventListener("click", openUserMedia);
  document.querySelector("#hangupBtn").addEventListener("click", hangUp);
  document.querySelector("#createBtn").addEventListener("click", createRoom);
  document.querySelector("#joinBtn").addEventListener("click", joinRoom);
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector("#room-dialog"));
}

async function createRoom() {
  document.querySelector("#createBtn").disabled = true;
  document.querySelector("#joinBtn").disabled = true;
  const db = firebase.firestore();
  const roomRef = await db.collection("rooms").doc();

  console.log("Create PeerConnection with configuration: ", configuration12);
  peerConnection12 = new RTCPeerConnection(configuration12);
  console.log("Create PeerConnection with configuration: ", configuration23);
  peerConnection23 = new RTCPeerConnection(configuration23);
  console.log("Create PeerConnection with configuration: ", configuration31);
  peerConnection31 = new RTCPeerConnection(configuration31);

  registerPeerConnectionListeners(peerConnection12);
  registerPeerConnectionListeners(peerConnection23);
  registerPeerConnectionListeners(peerConnection31);

  localStream.getTracks().forEach((track) => {
    peerConnection12.addTrack(track, localStream);
    peerConnection31.addTrack(track, localStream);
  });

  // Code for collecting ICE candidates below
  const callerCandidatesCollection = roomRef.collection("callerCandidates");

  peerConnection12.addEventListener("icecandidate", (event) => {
    if (!event.candidate) {
      console.log("Got final candidate!");
      return;
    }
    console.log("Got candidate: ", event.candidate);
    callerCandidatesCollection.add(event.candidate.toJSON());
  });
  // Code for collecting ICE candidates above

  // Code for creating a room below
  const offer12 = await peerConnection12.createOffer();
  await peerConnection12.setLocalDescription(offer12);
  console.log("Created offer12:", offer12);

  const offer31 = await peerConnection31.createOffer();
  await peerConnection31.setLocalDescription(offer31);
  console.log("Created offer31:", offer31);

  const roomWithOffer = {
    offer1to2: {
      type: offer12.type,
      sdp: offer12.sdp,
    },
    offer1to3: {
      type: offer31.type,
      sdp: offer31.sdp,
    },
  };

  await roomRef.set(roomWithOffer);
  roomId = roomRef.id;
  console.log(`New room created with SDP offer. Room ID: ${roomRef.id}`);
  document.querySelector(
    "#currentRoom"
  ).innerText = `Current room is ${roomRef.id} - You are the caller!`;
  // Code for creating a room above

  peerConnection12.addEventListener("track", (event) => {
    console.log("Got remote2 track:", event.streams[0]);
    event.streams[0].getTracks().forEach((track) => {
      console.log("Add a track to the remoteStreamA:", track);
      remoteStreamA.addTrack(track);
    });
  });

  // Listening for remote session description below
  roomRef.onSnapshot(async (snapshot) => {
    const data = snapshot.data();
    if (!peerConnection12.currentRemoteDescription && data && data.answer2) {
      console.log("Got remote2 description: ", data.answer);
      const rtcSessionDescription = new RTCSessionDescription(data.answer);
      await peerConnection12.setRemoteDescription(rtcSessionDescription);
    }
  });
  // Listening for remote session description above

  // Listen for remote ICE candidates below
  roomRef.collection("calleeCandidates").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await peerConnection12.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
  // Listen for remote ICE candidates above

  //peer31
  peerConnection31.addEventListener("icecandidate", (event) => {
    if (!event.candidate) {
      console.log("Got final candidate!");
      return;
    }
    console.log("Got candidate3: ", event.candidate);
    callerCandidatesCollection.add(event.candidate.toJSON());
  });
  // Code for collecting ICE candidates above

  //Code for creating a room below

  peerConnection31.addEventListener("track", (event) => {
    console.log("Got remote3 track:", event.streams[0]);
    event.streams[0].getTracks().forEach((track) => {
      console.log("Add a track to the remoteStreamB:", track);
      remoteStreamB.addTrack(track);
    });
  });

  // Listening for remote session description below
  roomRef.onSnapshot(async (snapshot) => {
    const data = snapshot.data();
    if (!peerConnection31.currentRemoteDescription && data && data.answer3) {
      console.log("Got remote3 description: ", data.answer);
      const rtcSessionDescription = new RTCSessionDescription(data.answer);
      await peerConnection31.setRemoteDescription(rtcSessionDescription);
    }
  });
  // Listening for remote session description above

  // Listen for remote ICE candidates below
  roomRef.collection("calleeCandidates").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await peerConnection31.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
  // Listen for remote ICE candidates above
}

function joinRoom() {
  document.querySelector("#createBtn").disabled = true;
  document.querySelector("#joinBtn").disabled = true;

  document.querySelector("#confirmJoinBtn").addEventListener(
    "click",
    async () => {
      roomId = document.querySelector("#room-id").value;
      console.log("Join room: ", roomId);
      document.querySelector(
        "#currentRoom"
      ).innerText = `Current room is ${roomId} - You are the callee!`;
      await joinRoomById(roomId);
    },
    { once: true }
  );
  roomDialog.open();
}

async function joinRoomById(roomId) {
  let userID = 2;
  if (exists2 == true) {
    userID = 3;
  }
  const db = firebase.firestore();
  const roomRef = db.collection("rooms").doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log("Got room:", roomSnapshot.exists);

  if (roomSnapshot.exists) {
    let configuration = null;
    if (userID == 2) {
      configuration = configuration12;
    } else if (userID == 3) {
      configuration = configuration31;
    }
    console.log("Create PeerConnection with configuration: ", configuration);
    let peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners(peerConnection);
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    // Code for collecting ICE candidates below
    const calleeCandidatesCollection = roomRef.collection("calleeCandidates");
    peerConnection.addEventListener("icecandidate", (event) => {
      if (!event.candidate) {
        console.log("Got final candidate!");
        return;
      }
      console.log("Got candidate: ", event.candidate);
      calleeCandidatesCollection.add(event.candidate.toJSON());
    });
    // Code for collecting ICE candidates above

    peerConnection.addEventListener("track", (event) => {
      console.log("Got remote track:", event.streams[0]);
      event.streams[0].getTracks().forEach((track) => {
        console.log("Add a track to the remoteStreamA:", track);
        remoteStreamA.addTrack(track);
      });
    });

    // Code for creating SDP answer below
    let offer = null;
    if (userID == 2) {
      offer = roomSnapshot.data().offer1to2;
    } else if (userID == 3) {
      offer = roomSnapshot.data().offer1to3;
    }
    console.log("Got offer:", offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    console.log("Created answer:", answer);
    await peerConnection.setLocalDescription(answer);

    const offer23 = await peerConnection31.createOffer();
    await peerConnection31.setLocalDescription(offer23);
    console.log("Created offer23:", offer23);

    let roomWithAnswer = null;

    if (userID == 2) {
      roomWithAnswer = {
        answer2to1: {
          type: answer.type,
          sdp: answer.sdp,
        },
        offer2to3: {
          type: offer23.type,
          sdp: offer23.sdp,
        },
      };
    } else if (userID == 3) {
      roomWithAnswer = {
        answer3to1: {
          type: answer.type,
          sdp: answer.sdp,
        },
        offer3to2: {
          type: offer23.type,
          sdp: offer23.sdp,
        },
      };
    }

    await roomRef.update(roomWithAnswer);
    // Code for creating SDP answer above

    // Listening for remote ICE candidates below
    roomRef.collection("callerCandidates").onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          let data = change.doc.data();
          console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
    // Listening for remote ICE candidates above

    //remote끼리 연결
    console.log(
      "Create PeerConnection with configuration23: ",
      configuration23
    );
    peerConnection = new RTCPeerConnection(configuration23);
    registerPeerConnectionListeners(peerConnection);
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    // Code for collecting ICE candidates below
    calleeCandidatesCollection = roomRef.collection("calleeCandidates");
    peerConnection.addEventListener("icecandidate", (event) => {
      if (!event.candidate) {
        console.log("Got final candidate!");
        return;
      }
      console.log("Got candidate: ", event.candidate);
      calleeCandidatesCollection.add(event.candidate.toJSON());
    });
    // Code for collecting ICE candidates above

    peerConnection.addEventListener("track", (event) => {
      console.log("Got remote track:", event.streams[0]);
      event.streams[0].getTracks().forEach((track) => {
        console.log("Add a track to the remoteStreamB:", track);
        remoteStreamB.addTrack(track);
      });
    });

    if (userID == 2) {
      offer = roomSnapshot.data().offer3to2;
    } else if (userID == 3) {
      offer = roomSnapshot.data().offer2to3;
    }
    console.log("Got offer:", offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    answer = await peerConnection.createAnswer();
    console.log("Created answer:", answer);
    await peerConnection.setLocalDescription(answer);

    if (userID == 2) {
      roomWithAnswer = {
        answer2to3: {
          type: answer.type,
          sdp: answer.sdp,
        },
      };
    } else if (userID == 3) {
      roomWithAnswer = {
        answer3to2: {
          type: answer.type,
          sdp: answer.sdp,
        },
      };
    }

    await roomRef.update(roomWithAnswer);
  }
}

async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  document.querySelector("#localVideo").srcObject = stream;
  localStream = stream;
  remoteStreamA = new MediaStream();
  remoteStreamB = new MediaStream();
  document.querySelector("#remoteVideoA").srcObject = remoteStreamA;
  document.querySelector("#remoteVideoB").srcObject = remoteStreamB;

  console.log("Stream:", document.querySelector("#localVideo").srcObject);
  document.querySelector("#cameraBtn").disabled = true;
  document.querySelector("#joinBtn").disabled = false;
  document.querySelector("#createBtn").disabled = false;
  document.querySelector("#hangupBtn").disabled = false;
}

async function hangUp(e) {
  const tracks = document.querySelector("#localVideo").srcObject.getTracks();
  tracks.forEach((track) => {
    track.stop();
  });

  if (remoteStreamA) {
    remoteStreamA.getTracks().forEach((track) => track.stop());
  }
  if (remoteStreamB) {
    remoteStreamB.getTracks().forEach((track) => track.stop());
  }

  if (peerConnection12) {
    peerConnection12.close();
  }
  if (peerConnection23) {
    peerConnection23.close();
  }
  if (peerConnection31) {
    peerConnection31.close();
  }

  document.querySelector("#localVideo").srcObject = null;
  document.querySelector("#remoteVideo").srcObject = null;
  document.querySelector("#cameraBtn").disabled = false;
  document.querySelector("#joinBtn").disabled = true;
  document.querySelector("#createBtn").disabled = true;
  document.querySelector("#hangupBtn").disabled = true;
  document.querySelector("#currentRoom").innerText = "";

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection("rooms").doc(roomId);
    const calleeCandidates = await roomRef.collection("calleeCandidates").get();
    calleeCandidates.forEach(async (candidate) => {
      await candidate.ref.delete();
    });
    const callerCandidates = await roomRef.collection("callerCandidates").get();
    callerCandidates.forEach(async (candidate) => {
      await candidate.ref.delete();
    });
    await roomRef.delete();
  }

  document.location.reload(true);
}

function registerPeerConnectionListeners(peerConnection) {
  peerConnection.addEventListener("icegatheringstatechange", () => {
    console.log(
      `ICE gathering state changed: ${peerConnection.iceGatheringState}`
    );
  });

  peerConnection.addEventListener("connectionstatechange", () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
  });

  peerConnection.addEventListener("signalingstatechange", () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener("iceconnectionstatechange ", () => {
    console.log(
      `ICE connection state change: ${peerConnection.iceConnectionState}`
    );
  });
}

init();
