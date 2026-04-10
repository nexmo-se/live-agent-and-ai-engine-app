'use strict'

//-------------

require('dotenv').config();

//--
const express = require('express');
const bodyParser = require('body-parser')
const app = express();

app.use(bodyParser.json());

const fs = require('fs');
const axios = require('axios');
const moment = require('moment');

//---- CORS policy - Update this section as needed ----

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
  next();
});

//--- Vonage API - SDK instance ---

const { Auth } = require('@vonage/auth');

const credentials = new Auth({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: process.env.APP_ID,
  privateKey: './.private.key'    // private key file name with a leading dot 
});

const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage(credentials);

//-- Vonage API - A phone number associated to this application (see in dashboard) --

const servicePhoneNumber = process.env.SERVICE_PHONE_NUMBER;
console.log('---------------------------------------------------------------------');
console.log("As the live agent, you may call in to the phone number:", servicePhoneNumber);
console.log('---------------------------------------------------------------------');

//-- Test callee number / Normally your application gets it from an incoming SIP call custom header or a database --
const testCalleeNumber = process.env.TEST_CALLEE_NUMBER;

//-- Vonage API - For optional call leg recording --

const appId = process.env.APP_ID; // used by tokenGenerate
const privateKey = fs.readFileSync('./.private.key'); // used by tokenGenerate
const { tokenGenerate } = require('@vonage/jwt');

const apiBaseUrl = 'https://api.nexmo.com';

let recordCalls = false;
if (process.env.RECORD_CALLS == 'true') {
  recordCalls = true
}

//---- Connector server (middleware) ----
const processorServer = process.env.PROCESSOR_SERVER;

//---- initial call uuid to other uuids tracking ----

let uuidTracking = {};

function createUuidTracking(uuid) {
  uuidTracking[uuid] = {};
  uuidTracking[uuid]["ws1Uuid"] = null;
  uuidTracking[uuid]["ws2Uuid"] = null;
  uuidTracking[uuid]["pstn2Uuid"] = null;
}

function deleteFromUuidTracking(uuid) {
  delete uuidTracking[uuid];
}

//============= Processing inbound PSTN or SIP calls ===============

//-- Incoming PSTN/SIP call --

app.get('/answer', async(req, res) => {

  const uuid = req.query.uuid;
  const hostName = req.hostname;

  createUuidTracking(uuid);

  //--

  // if (recordCalls) {
  //   //-- RTC webhooks need to be enabled for this application in the dashboard --
    
  //   //-- start "leg" recording --
  //   const accessToken = tokenGenerate(appId, privateKey, {});
  
  //   try { 
  //     const response = await axios.post(apiBaseUrl + '/v1/legs/' + uuid + '/recording',
  //       {
  //         "split": true,
  //         "streamed": true,
  //         // "beep": true,
  //         "public": true,
  //         "validity_time": 30,
  //         "format": "mp3",
  //         // "transcription": {
  //         //   "language":"en-US",
  //         //   "sentiment_analysis": true
  //         // }
  //       },
  //       {
  //         headers: {
  //           "Authorization": 'Bearer ' + accessToken,
  //           "Content-Type": 'application/json'
  //         }
  //       }
  //     );
  //     console.log('\n>>> Start recording on leg:', uuid);
  //   } catch (error) {
  //     console.log('\n>>> Error start recording on leg:', uuid, error);
  //   }

  // } 

  //--

  // const calleeNumber = req.query.xxxxx.xxxx || testCalleeNumber; // dynamically set from the incoming SIP incoming call custom SIP header or from some other means (e.g. your database)
  const calleeNumber = testCalleeNumber; // just for tests


  //-- create WebSocket 1 leg
  const wsUri = 'wss://' + processorServer + '/socket1?original_uuid=' + uuid + '&ws=ws1&callee=' + calleeNumber + '&webhook_url=https://' + hostName + '/results';

  const nccoResponse = [
    {
      "action": "connect",
      "eventType": "synchronous",
      "eventUrl": ['https://' + hostName + '/ws1_event?original_uuid=' + uuid + '&ws=ws1&callee=' + calleeNumber + '&webhook_url=https://' + hostName + '/results'],
      "from": servicePhoneNumber,
      "endpoint": [
        {
          "type": "websocket",
          "uri": wsUri,
          "content-type": "audio/l16;rate=16000",
          "headers": {
              "original_uuid": uuid,
              "callee": calleeNumber,
              "webhook_url": "https://" + hostName + "/results",
              "ws": 'ws1'
          }
        // ,
        // "authorization": {
        //     "type": "custom",
        //     "value": "Bearer eyJhbGciOi..."
        // }
        }
      ]
    }
  ];

  res.status(200).json(nccoResponse);

});

//------------

app.post('/event', async(req, res) => {

  res.status(200).send('Ok');

  //---

  if (req.body.status == "completed") {

    const uuid = req.body.uuid;

    console.log("\n>>> Terminated PSTN 1 leg", uuid);

    // terminate ws 2 leg (which also terminates pstn 2 leg)
    const ws2Uuid = uuidTracking[uuid]["ws2Uuid"];

    if (ws2Uuid) {
      vonage.voice.hangupCall(ws2Uuid)
        // .then(res => console.log(">>> Terminated WebSocket 2 leg", ws2Uuid))
        .then(res => {})
        .catch(err => console.error(">>> Error terminating WebSocket 2 leg", ws2Uuid, err));
    }

    //--  

    setTimeout ( () => {
      deleteFromUuidTracking(uuid);
    }, 10000);  

  }

});

//------------

app.post('/ws1_event', async(req, res) => {

  res.status(200).send('Ok');

  if (req.body.status == 'answered') {  // this is when the WebSocket leg 1 is connected to connector server

    const originalUuid = req.query.original_uuid;
    const uuid = req.body.uuid;
    uuidTracking[originalUuid]["ws1Uuid"] = uuid;

    const calleeNumber = req.query.callee;

    const hostName = req.hostname;

    //-- create WebSocket 2 leg --
    const wsUri = 'wss://' + processorServer + '/socket2?original_uuid=' + originalUuid + '&ws=ws2&callee=' + calleeNumber + '&outbound_pstn=true&webhook_url=https://' + hostName + '/results';
   
    vonage.voice.createOutboundCall({
      to: [{
        type: 'websocket',
        uri: wsUri,
        'content-type': 'audio/l16;rate=16000'  // NEVER change the content-type parameter argument
      }],
      from: {
        type: 'phone',
        number: calleeNumber // value does not matter
      },
      ncco: [
        {
          "action": "connect",
          "eventUrl": ["https://" + hostName + "/pstn2_event?original_uuid=" + originalUuid + "&callee=" + calleeNumber],
          "timeout": "45",
          "from": servicePhoneNumber,
          "endpoint": [
            {
              "type": "phone",
              "number": calleeNumber
            }
          ]

        }
      ],
      event_url: ['https://' + hostName + '/ws2_event?original_uuid=' + originalUuid + '&ws=ws2&callee=' + calleeNumber + '&outbound_pstn=true&webhook_url=https://' + hostName + '/results'],
      event_method: 'POST'
      })
      .then(res => {
        console.log("\n>>> WebSocket 2 created", res.uuid);
        uuidTracking[originalUuid]["ws2Uuid"] = res.uuid;
      })
      .catch(err => console.error("\n>>> WebSocket create error:", err));
  }

  //--

  if (req.body.status == "completed") {
    console.log("\n>>> Terminated WebSocket 1 leg", req.body.uuid);
  }

});


//------------

app.post('/ws2_event', async(req, res) => {

  res.status(200).send('Ok');

  //--

  if (req.body.status == "completed") {

    const originalUuid = req.query.original_uuid;

    vonage.voice.hangupCall(originalUuid)
      .then(res => {})
      .catch(err => console.error(">>> Error terminating PSTN/SIP 1 leg", originalUuid, err));

    console.log("\n>>> Terminated WebSocket 2 leg", req.body.uuid);
  }

});

//-----------

app.post('/pstn2_event', async(req, res) => {

  res.status(200).send('Ok');

  //--

  if (req.body.status == "started") {

    uuidTracking[req.query.original_uuid]["pstn2Uuid"] = req.body.uuid;

    //--

    if (recordCalls) {

      //-- start PSTN 2 leg 2-channel audio recording --
      const accessToken = tokenGenerate(appId, privateKey, {});

      const uuid = req.body.uuid;
    
      try { 
        const response = await axios.post(apiBaseUrl + '/v1/legs/' + uuid + '/recording',
          {
            "split": true,
            "streamed": true,
            "public": true,
            "validity_time": 30,
            "format": "mp3"
          },
          {
            headers: {
              "Authorization": 'Bearer ' + accessToken,
              "Content-Type": 'application/json'
            }
          }
        );
        console.log('\n>>> Start recording on leg:', uuid);
      } catch (error) {
        console.log('\n>>> Error start recording on leg:', uuid, error);
      }

    }  

  }

  //-----

  if (req.body.status == 'answered') {

    const originalUuid = req.query.original_uuid;

    const ws2Uuid = uuidTracking[originalUuid]["ws2Uuid"];

    //-- notify WebSocket 2 that outbound PSTN call has been answered

    //-- need to do this notification out of band (out of WebSocket itself)
    // b/c it introduces 300 ms inter audio packet delay which creates an audio artifact heard by PSTN 1 / SIP 1 party
    // vonage.voice.playDTMF(ws2Uuid, '9')          
    //   .then(resp => console.log("Play DTMF '9' to WebSocket", ws2Uuid))
    //   .catch(err => console.error("Error play DTMF to WebSocket", ws2Uuid, err));

    //-- out of band notification to WebSocket 2  
    try { 
      const response = await axios.post('https://' + processorServer + '/pstn2answered' ,
        {
          "original_uuid": originalUuid
        },
        {
          headers: {
            "Content-Type": 'application/json'
          }
        }
      );
      console.log('\n>>> Notification to ws2:', ws2Uuid);
    } catch (error) {
      console.log('\n>>> Error notifying ws2:', ws2Uuid, error);
    }

  }

  //-----

  if (req.body.status == "completed") { 

    console.log("\n>>> Terminated PSTN 2 leg", req.body.uuid);

    // terminate incoming PSTN/SIP call (which also terminates WebSocket leg 1)
    const originalUuid = req.query.original_uuid;

    vonage.voice.hangupCall(originalUuid)
      .then(res => {})
      .catch(err => console.error(">>> Error terminating PSTN 1 leg", originalUuid, err));
  
  }

  //-----

  if (req.body.status == "rejected") { 

    console.log("\n>>> Failed to call phone number", req.body.to, "!!!");
    console.log(">>> Try to call phone number", req.body.to, "from a cell phone or a landline phone.\n");

  }

});

//------------

app.post('/results', async(req, res) => {

  res.status(200).send('Ok');

  if (req.body.type == "Results") {
    const transcript = req.body.channel.alternatives[0].transcript;

    if (transcript != "") {
      console.log('\n>>> Transcript:', transcript);
    }
  }

});

//-------------

//-- Retrieve call recordings --
//-- RTC webhook URL set to 'https://<this-server>/rtc' for this application in the dashboard --

app.post('/rtc', async(req, res) => {

  res.status(200).send('Ok');

  switch (req.body.type) {

    case "audio:record:done": // leg recording, get the audio file
      console.log('\n>>> /rtc audio:record:done');
      console.log('req.body.body.destination_url', req.body.body.destination_url);
      console.log('req.body.body.recording_id', req.body.body.recording_id);

      await vonage.voice.downloadRecording(req.body.body.destination_url, './post-call-data/' + req.body.body.recording_id + '_' + req.body.body.channel.id + '.mp3');
 
      break;

    case "audio:transcribe:done": // leg recording, get the transcript
      console.log('\n>>> /rtc audio:transcribe:done');
      console.log('req.body.body.transcription_url', req.body.body.transcription_url);
      console.log('req.body.body.recording_id', req.body.body.recording_id);

      await vonage.voice.downloadTranscription(req.body.body.transcription_url, './post-call-data/' + req.body.body.recording_id + '.txt');  

      break;

    case "audio:dtmf":

      const dtmf = req.body.body.digit;
      const originalUuid = req.body.body.channel.id;

      // forward DTMF from PSTN/SIP 1 to PSTN 2
      vonage.voice.playDTMF(uuidTracking[originalUuid]["pstn2Uuid"], dtmf)          
        .then(resp => console.log(">>> Forwarded DTMF"))
        .catch(err => console.error(">>> Error play DTMF to PSTN 2", uuidTracking[originalUuid]["pstn2Uuid"], err));

      break;

    default:  
      // do nothing

  }

});
 

//--- If this application is hosted on VCR (Vonage Cloud Runtime) serverless infrastructure --------

app.get('/_/health', async(req, res) => {

  res.status(200).send('Ok');

});

//=========================================

const port = process.env.VCR_PORT || process.env.PORT || 8000;

app.listen(port, () => console.log(`\nVoice API application listening on port ${port}`));

//------------
