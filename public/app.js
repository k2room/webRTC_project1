mdc.ripple.MDCRipple.attachTo(document.querySelector(".mdc-button"));

const configuration12 = {
    iceServers: [
        {
            urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
        },
    ],
    iceCandidatePoolSize: 30,
};

const configuration23 = {
    iceServers: [
        {
            urls: ["stun:stun2.l.google.com:19302", "stun:stun3.l.google.com:19302"],
        },
    ],
    iceCandidatePoolSize: 30,
};

const configuration31 = {
    iceServers: [
        {
            urls: ["stun:stun3.l.google.com:19302", "stun:stun1.l.google.com:19302"],
        },
    ],
    iceCandidatePoolSize: 30,
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
let userID = null;
let w1 = null; // user1's forbidden word
let w2 = null;
let w3 = null;
let flag1 = true; // user1 said forbidden work or not
let flag2 = true;
let flag3 = true;

/////////////////////////////////////////////////////////////////////////////////////////////

const language = 'en-US'; //'ko-KR'
const words = ["gwangju", "science", "work", "study", "college", "team"];

/////////////////////////////////////////////////////////////////////////////////////////////

const FIRST_CHAR = /\S/;
const TWO_LINE = /\n\n/g;
const ONE_LINE = /\n/g;

const recognition = new webkitSpeechRecognition();
const $btnMic = document.querySelector('#btn-mic');
// const $btnMic = document.querySelector('#playBtn');

let isRecognizing = false;
let ignoreEndProcess = true;
let finalTranscript = '';

recognition.continuous = true; ////// true
recognition.interimResults = true;


function init() {
    document.querySelector("#cameraBtn").addEventListener("click", openUserMedia);
    document.querySelector("#hangupBtn").addEventListener("click", hangUp);
    document.querySelector("#createBtn").addEventListener("click", createRoom);
    document.querySelector("#joinBtn").addEventListener("click", joinRoom);
    document.querySelector("#playBtn").addEventListener("click", playgame);

    // $btnMic.addEventListener('click', start);
    $btnMic.addEventListener('click', () => {
        // const text = final_span.innerText || defaultMsg;
        start();
    });

    roomDialog = new mdc.dialog.MDCDialog(document.querySelector("#room-dialog"));
}

// 방 생성시 실행
async function createRoom() {
    userID = 1;
    document.querySelector("#createBtn").disabled = true;
    document.querySelector("#joinBtn").disabled = true;
    document.querySelector("#playBtn").disabled = false;

    const db = firebase.firestore();
    const roomRef = await db.collection("rooms").doc();

    // 1&2, 1&3 사이의 RTCPeerConnection 생성
    console.log("Create PeerConnection with configuration: ", configuration12);
    peerConnection12 = new RTCPeerConnection(configuration12);

    console.log("Create PeerConnection with configuration: ", configuration31);
    peerConnection31 = new RTCPeerConnection(configuration31);


    registerPeerConnectionListeners(peerConnection12);
    registerPeerConnectionListeners(peerConnection31);

    localStream.getTracks().forEach((track) => {
        peerConnection12.addTrack(track, localStream);
        peerConnection31.addTrack(track, localStream);
    });


    // Code for collecting ICE candidates below (1-2, 1-3)
    const callerCandidatesCollection12 = roomRef.collection("callerCandidate12");
    peerConnection12.addEventListener("icecandidate", (event) => {
        if (!event.candidate) {
            console.log("Got final candidate!");
            return;
        }
        console.log("Got candidate: ", event.candidate);
        callerCandidatesCollection12.add(event.candidate.toJSON());
    });

    const callerCandidatesCollection31 = roomRef.collection("callerCandidate31");
    peerConnection31.addEventListener("icecandidate", (event) => {
        if (!event.candidate) {
            console.log("Got final candidate!");
            return;
        }
        console.log("Got candidate3: ", event.candidate);
        callerCandidatesCollection31.add(event.candidate.toJSON());
    });
    // Code for collecting ICE candidates above

    // Code for creating a room and offer from 1 below
    //
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
    // Code for creating a room and offer from 1 above

    // remoteVideo 2개에 track 할당
    peerConnection12.addEventListener("track", (event) => {
        console.log("Got remoteA track:", event.streams[0]);
        event.streams[0].getTracks().forEach((track) => {
            console.log("Add a track to the remoteStreamA:", track);
            remoteStreamA.addTrack(track);
        });
    });

    peerConnection31.addEventListener("track", (event) => {
        console.log("Got remoteB track:", event.streams[0]);
        event.streams[0].getTracks().forEach((track) => {
            console.log("Add a track to the remoteStreamB:", track);
            remoteStreamB.addTrack(track);
        });
    });

    // Listening for remote session description below
    roomRef.onSnapshot(async (snapshot) => {
        const data = snapshot.data();
        if (!peerConnection12.currentRemoteDescription && data && data.answer2to1) {
            console.log("Got remoteA description: ", data.answer2to1);
            const rtcSessionDescription = new RTCSessionDescription(data.answer2to1);
            await peerConnection12.setRemoteDescription(rtcSessionDescription);
        }
    });

    roomRef.onSnapshot(async (snapshot) => {
        const data = snapshot.data();
        if (!peerConnection31.currentRemoteDescription && data && data.answer3to1) {
            console.log("Got remoteB description: ", data.answer3to1);
            const rtcSessionDescription = new RTCSessionDescription(data.answer3to1);
            await peerConnection31.setRemoteDescription(rtcSessionDescription);
        }
    });
    // Listening for remote session description above

    // Listen for remote ICE candidates below
    roomRef.collection("calleeCandidate12").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
                let data = change.doc.data();
                console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
                await peerConnection12.addIceCandidate(new RTCIceCandidate(data));
            }
        });
    });

    roomRef.collection("calleeCandidate31").onSnapshot((snapshot) => {
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

// join할 때 실행
function joinRoom() {
    document.querySelector("#createBtn").disabled = true;
    document.querySelector("#joinBtn").disabled = true;
    document.querySelector("#playBtn").disabled = false;
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

// room ID로 방 입장
async function joinRoomById(roomId) {

    // fireStore에서 roomID로 DB 가져오기
    const db = firebase.firestore();
    const roomRef = db.collection("rooms").doc(`${roomId}`);
    const roomSnapshot = await roomRef.get();
    console.log("Got room:", roomSnapshot.exists);

    // roomID 정확하게 입력 시
    if (roomSnapshot.exists) {
        // 해당 room에 처음 join한 user의 userID=2(user2), 세 번째로 join한 user의 userID=3(user3)
        userID = 2;
        const exists2 = roomSnapshot.data().answer2to1;
        if (exists2 != undefined) {
            userID = 3;
        }

        let configuration = null;
        if (userID == 2) {
            configuration = configuration12;
        } else if (userID == 3) {
            configuration = configuration31;
        }

        // user1과의 연결에 사용될 RTCPeerConnection 생성
        console.log("Create PeerConnection with configuration: ", configuration);
        let peerConnectionWith1 = new RTCPeerConnection(configuration);
        registerPeerConnectionListeners(peerConnectionWith1);
        localStream.getTracks().forEach((track) => {
            peerConnectionWith1.addTrack(track, localStream);
        });

        // user1과의 연결
        // Code for collecting ICE callee candidates below
        if (userID == 2) {
            const calleeCandidatesCollection12 =
                roomRef.collection("calleeCandidate12");
            peerConnectionWith1.addEventListener("icecandidate", (event) => {
                if (!event.candidate) {
                    console.log("Got final candidate!");
                    return;
                }
                console.log("Got candidate: ", event.candidate);
                calleeCandidatesCollection12.add(event.candidate.toJSON());
            });
        } else if (userID == 3) {
            const calleeCandidatesCollection31 =
                roomRef.collection("calleeCandidate31");
            peerConnectionWith1.addEventListener("icecandidate", (event) => {
                if (!event.candidate) {
                    console.log("Got final candidate!");
                    return;
                }
                console.log("Got candidate: ", event.candidate);
                calleeCandidatesCollection31.add(event.candidate.toJSON());
            });
        }
        // Code for collecting ICE candidates above

        // user1(방장)의 비디오는 remoteStreamA에 송출한다.
        peerConnectionWith1.addEventListener("track", (event) => {
            console.log("Got remote track:", event.streams[0]);
            event.streams[0].getTracks().forEach((track) => {
                console.log("Add a track to the remoteStreamA:", track);
                remoteStreamA.addTrack(track);
            });
        });

        // userID에 따라 user1에 응답 answer 전송 + callerCandidate에 user1 추가
        // Code for creating SDP answer below
        let offer = null;
        if (userID == 2) {

            offer = roomSnapshot.data().offer1to2;
            console.log("Got offer:", offer);
            await peerConnectionWith1.setRemoteDescription(
                new RTCSessionDescription(offer)
            );
            const answerTo1 = await peerConnectionWith1.createAnswer();
            console.log("Created answer:", answerTo1);
            await peerConnectionWith1.setLocalDescription(answerTo1);

            roomWithAnswer = {
                answer2to1: {
                    type: answerTo1.type,
                    sdp: answerTo1.sdp,
                },
            };
            await roomRef.update(roomWithAnswer);

            roomRef.collection("callerCandidate12").onSnapshot((snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === "added") {
                        let data = change.doc.data();
                        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
                        await peerConnectionWith1.addIceCandidate(new RTCIceCandidate(data));
                    }
                });
            });

        } else if (userID == 3) {
            offer = roomSnapshot.data().offer1to3;
            console.log("Got offer:", offer);
            await peerConnectionWith1.setRemoteDescription(
                new RTCSessionDescription(offer)
            );
            const answerTo1 = await peerConnectionWith1.createAnswer();
            console.log("Created answer:", answerTo1);
            await peerConnectionWith1.setLocalDescription(answerTo1);

            roomWithAnswer = {
                answer3to1: {
                    type: answerTo1.type,
                    sdp: answerTo1.sdp,
                },
            };
            await roomRef.update(roomWithAnswer);

            roomRef.collection("callerCandidate31").onSnapshot((snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === "added") {
                        let data = change.doc.data();
                        console.log(
                            `Got new remote ICE candidate: ${JSON.stringify(data)}`
                        );
                        await peerConnectionWith1.addIceCandidate(
                            new RTCIceCandidate(data)
                        );
                    }
                });
            });
        }

        // 2&3 연결하는 RTCConnection 생성
        console.log("Create PeerConnection with configuration: ", configuration23);
        peerConnection23 = new RTCPeerConnection(configuration23);

        registerPeerConnectionListeners(peerConnection23);
        localStream.getTracks().forEach((track) => {
            peerConnection23.addTrack(track, localStream);
        });

        console.log("!!!!your ID: !!!!", userID);

        if (userID == 2) {

            // caller candidate에 user2 추가
            const callerCandidatesCollection23 =
                roomRef.collection("callerCandidate23");
            peerConnection23.addEventListener("icecandidate", (event) => {
                if (!event.candidate) {
                    console.log("Got final candidate!");
                    return;
                }
                console.log("Got candidate3: ", event.candidate);
                callerCandidatesCollection23.add(event.candidate.toJSON());
            });

            // remoteStreamB에는 user3 track 할당
            peerConnection23.addEventListener("track", (event) => {
                console.log("Got remote3 track:", event.streams[0]);
                event.streams[0].getTracks().forEach((track) => {
                    console.log("Add a track to the remoteStreamB:", track);
                    remoteStreamB.addTrack(track);
                });
            });

            // 2 -> 3 보내는 offer 생성
            const offer2to3 = await peerConnection23.createOffer();
            await peerConnection23.setLocalDescription(offer2to3);
            console.log("Created offer23:", offer2to3);

            let roomWithOfferTo3 = {
                offer2to3: {
                    type: offer2to3.type,
                    sdp: offer2to3.sdp,
                },
            };

            await roomRef.update(roomWithOfferTo3);

            // Listening for remote session description below (3에서 2에 보낸 answer을 remoteDescription에 넣기)
            roomRef.onSnapshot(async (snapshot) => {
                const data = snapshot.data();
                if (!peerConnection23.currentRemoteDescription && data && data.answer3to2) {
                    console.log("Got remote3 description: ", data.answer3to2);
                    const rtcSessionDescription = new RTCSessionDescription(data.answer3to2);
                    await peerConnection23.setRemoteDescription(rtcSessionDescription);
                }
            });
            // Listening for remote session description above

            // Listen for remote ICE callee candidates below
            roomRef.collection("calleeCandidate23").onSnapshot((snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === "added") {
                        let data = change.doc.data();
                        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
                        await peerConnection23.addIceCandidate(new RTCIceCandidate(data));
                    }
                });
            });
            // Listen for remote ICE callee candidates below


        } else if (userID == 3) {
            // callee candidate에 user3 추가
            const calleeCandidatesCollection23 =
                roomRef.collection("calleeCandidate23");
            peerConnection23.addEventListener("icecandidate", (event) => {
                if (!event.candidate) {
                    console.log("Got final candidate!");
                    return;
                }
                console.log("Got candidate: ", event.candidate);
                calleeCandidatesCollection23.add(event.candidate.toJSON());
            });

            // remoteStreamB에는 user2 track 할당
            peerConnection23.addEventListener("track", (event) => {
                console.log("Got remote track:", event.streams[0]);
                event.streams[0].getTracks().forEach((track) => {
                    console.log("Add a track to the remoteStreamB:", track);
                    remoteStreamB.addTrack(track);
                });
            });

            // Code for creating SDP answer below (2가 3에게 보낸 offer를 받아서 이에 대한 answer를 저장)
            let offer23 = roomSnapshot.data().offer2to3;
            console.log("Got offer from 2:", offer23);
            await peerConnection23.setRemoteDescription(
                new RTCSessionDescription(offer23)
            );
            const answer3to2 = await peerConnection23.createAnswer();
            console.log("Created answer to 2:", answer3to2);
            await peerConnection23.setLocalDescription(answer3to2);

            let roomWithAnswerTo2 = {
                answer3to2: {
                    type: answer3to2.type,
                    sdp: answer3to2.sdp,
                },
            };

            await roomRef.update(roomWithAnswerTo2);

            // Listen for remote ICE caller candidates below
            roomRef.collection("callerCandidate23").onSnapshot((snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === "added") {
                        let data = change.doc.data();
                        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
                        await peerConnection23.addIceCandidate(new RTCIceCandidate(data));
                    }
                });
            });
            // Listen for remote ICE caller candidates above

        }
    }
}

// user의 카메라/오디오를 켰을 때 실행
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
    document.querySelector("#playBtn").disabled = false;
    document.querySelector("#hangupBtn").disabled = false;
}

async function playgame(PeerConnection) {
    document.querySelector("#playBtn").disabled = true;
    document.querySelector("#btn-mic").disabled = false;
    document.querySelector("#userid").innerText = "Your ID is user" + userID;

    // var words = ["gwangju", "science", "work", "study", "college", "team", "startup", "math"]; 
    // userID == 1이면 랜덤리스트 업데이트
    if (userID == 1) {
        let randomlist = [];
        for (var i = 0; i < 3; i++) {
            const list = words.splice(Math.floor(Math.random() * words.length), 1)[0];
            randomlist.push(list);
        }
        // console.log('randomlist', randomlist);
        w1 = randomlist[0];
        w2 = randomlist[1];
        w3 = randomlist[2];

        // user1에게 user2와 user3의 금지어 보여주기
        document.querySelector(
            "#forbiddenword1"
        ).innerText = "Forbidden word of User2 is " + w2;
        document.querySelector(
            "#forbiddenword2"
        ).innerText = " Forbidden word of User3 is " + w3;

        var wordlist = {
            word1: w1,
            word2: w2,
            word3: w3
        };
        // DB에 금칙어 필드 값 추가하기 +  user1,2,3의 금칙어 설정하기
        console.log(wordlist);
        const db = firebase.firestore();
        const roomRef = db.collection("rooms").doc(roomId);
        roomRef.update(wordlist);
        const forbidden1 = w1;
    }
    else {
        const db = firebase.firestore();
        const roomRef = db.collection("rooms").doc(roomId);
        const roomSnapshot = await roomRef.get();
        if (userID == 2) {
            const forbidden2 = roomSnapshot.data().word2;
            console.log(forbidden2);
        } else if (userID == 3) {
            const forbidden3 = roomSnapshot.data().word3;
            console.log(forbidden3);
        }
    }
    // DB에서 word(금칙어) 불러오기 
    const db = firebase.firestore();
    const roomRef = db.collection("rooms").doc(roomId);
    const snapshot = await roomRef.get();
    const wo1 = snapshot.data().word1;
    const wo2 = snapshot.data().word2;
    const wo3 = snapshot.data().word3;

    // user2와 user3에게 상대방의 금칙어 알려주기 
    if (userID == 2) {
        document.querySelector(
            "#forbiddenword1"
        ).innerText = "Forbidden word of User1 is " + wo1;
        document.querySelector(
            "#forbiddenword2"
        ).innerText = " Forbidden word of User3 is " + wo3;
    } else if (userID == 3) {
        document.querySelector(
            "#forbiddenword1"
        ).innerText = "Forbidden word of User1 is " + wo1;
        document.querySelector(
            "#forbiddenword2"
        ).innerText = " Forbidden word of User2 is " + wo2;
    }

}

// 연결 끊었을 때 실행
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
    document.querySelector("#remoteVideoA").srcObject = null;
    document.querySelector("#remoteVideoB").srcObject = null;
    document.querySelector("#cameraBtn").disabled = false;
    document.querySelector("#joinBtn").disabled = true;
    document.querySelector("#createBtn").disabled = true;
    document.querySelector("#playBtn").disabled = true;
    document.querySelector("#hangupBtn").disabled = true;
    document.querySelector("#currentRoom").innerText = "";

    // Delete room on hangup
    if (roomId) {
        const db = firebase.firestore();
        const roomRef = db.collection("rooms").doc(roomId);
        const calleeCandidate12 = await roomRef
            .collection("calleeCandidate12")
            .get();
        calleeCandidate12.forEach(async (candidate) => {
            await candidate.ref.delete();
        });

        const calleeCandidate23 = await roomRef
            .collection("calleeCandidate31")
            .get();
        calleeCandidate23.forEach(async (candidate) => {
            await candidate.ref.delete();
        });

        const calleeCandidate31 = await roomRef
            .collection("calleeCandidate23")
            .get();
        calleeCandidate31.forEach(async (candidate) => {
            await candidate.ref.delete();
        });

        const callerCandidate12 = await roomRef
            .collection("callerCandidate12")
            .get();
        callerCandidate12.forEach(async (candidate) => {
            await candidate.ref.delete();
        });

        const callerCandidate23 = await roomRef
            .collection("callerCandidate23")
            .get();
        callerCandidate23.forEach(async (candidate) => {
            await candidate.ref.delete();
        });

        const callerCandidate31 = await roomRef
            .collection("callerCandidate31")
            .get();
        callerCandidate31.forEach(async (candidate) => {
            await candidate.ref.delete();
        });
        await roomRef.delete();
    }

    document.location.reload(true);
}

// PeerConnectionListener가 되겠다. (연결을 받아들이겠다.)
function registerPeerConnectionListeners(peerConnection) {
    peerConnection.addEventListener("icegatheringstatechange", () => {
        console.log(`ICE gathering state changed: ${peerConnection.iceGatheringState}`);
    });

    peerConnection.addEventListener("connectionstatechange", () => {
        console.log(`Connection state change: ${peerConnection.connectionState}`);
    });

    peerConnection.addEventListener("signalingstatechange", () => {
        console.log(`Signaling state change: ${peerConnection.signalingState}`);
    });

    peerConnection.addEventListener("iceconnectionstatechange ", () => {
        console.log(`ICE connection state change: ${peerConnection.iceConnectionState}`);
    });
}

// 음성 인식 시작 처리
recognition.onstart = function () {
    console.log('onstart', arguments);
    isRecognizing = true;
    document.querySelector("#btn-mic").disabled = true;
};

// 음성 인식 종료 처리
recognition.onend = function () {
    document.querySelector("#btn-mic").disabled = false;
    console.log('onend', arguments);
    isRecognizing = false;

    if (ignoreEndProcess) {
        return false;
    }

    // Do end process
    recording_state.className = 'off';
    console.log('off')
    if (!finalTranscript) {
        console.log('empty finalTranscript');
        return false;
    }

};


// 음성 인식 결과 처리
recognition.onresult = function (event) {
    console.log('onresult', event);

    let interimTranscript = '';
    if (typeof event.results === 'undefined') {
        recognition.onend = null;
        recognition.stop();
        return;
    }

    for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
            finalTranscript += transcript;
        } else {
            interimTranscript += transcript;
        }
    }
    if (finalTranscript != '') {
        final_span.innerHTML = linebreak(finalTranscript);
        console.log('finalTranscript', finalTranscript);
    }
    if (interimTranscript != '') {
        interim_span.innerHTML = linebreak(interimTranscript);
        console.log('interimTranscript', interimTranscript);
        fireCommand(interimTranscript);
    }

};

// 음성 인식 에러 처리
recognition.onerror = function (event) {
    console.log('onerror', event);

    if (event.error.match(/no-speech|audio-capture|not-allowed/)) {
        ignoreEndProcess = true;
    }

    document.querySelector("#btn-mic").disabled = false;
};

/**
 * 명령어 처리
 * @param string
 */
function fireCommand(string) {
    console.log("Recognition:" + string);
    var ws = string.split(" ");
    console.log(ws, ws.length);

    var flags = {
        flag1: flag1,
        flag2: flag2,
        flag3: flag3
    };

    for (var i = 0; i < ws.length; i++) {
        // console.log(ws[i], typeof(ws[i]), w1, typeof(w1)); // ~~, string
        if (ws[i] == '') {
            continue;
        } else if (userID == 1 && (ws[i].toLowerCase() == w1 || ws[i].toLowerCase() == w1)) {
            flag1 = false;
            console.log(ws[i], "Fobidden word!!!!!!!!!!!");
        } else if (userID == 2 && (ws[i].toLowerCase() == w2 || ws[i].toLowerCase() == w2)) {
            flag2 = false;
            console.log(ws[i], "Fobidden word!!!!!!!!!!!");
        } else if (userID == 3 && (ws[i].toLowerCase() == w3 || ws[i].toLowerCase() == w3)) {
            flag3 = false;
            console.log(ws[i], "Fobidden word!!!!!!!!!!!");
        }

    }

    const db = firebase.firestore();
    const roomRef = db.collection("rooms").doc(roomId);
    roomRef.update(flags);
}

/**
* 개행 처리
* @param {string} s
*/
function linebreak(s) {
    return s.replace(TWO_LINE, '<p></p>').replace(ONE_LINE, '<br>');
}


// 음성 인식 트리거
function start() {
    if (isRecognizing) {
        recognition.stop();
        return;
    }
    recognition.lang = language;
    recognition.start();

    finalTranscript = '';
    final_span.innerHTML = '';
    interim_span.innerHTML = '';
}

init();