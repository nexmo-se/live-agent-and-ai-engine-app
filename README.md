# Application using Vonage Voice API for handling live agent incoming call, outbound call to a party, and AI engine for real-time transcription of called party's speech

## Requirements

Called party maybe a human, an IVR, a voice bot, or a voicemail system.

Live agent and AI engine should hear or capture what the called party says from the beginning of the answered outbound call.

The AI engine can hear only the audio from the called party and not from the live agent.

The called party and the live agent can talk to each other.

## Overview


TO BE WRITTEN

and SOLUTION ARCHITECTURE DIAGRAM TO BE DRAWN


## Set up

### Set up the peer Connector (middleware) server - Host server public hostname and port

First set up the peer Connector server from https://github.com/nexmo-se/live-agent-and-ai-engine-connector.

Default local (not public!) of the Connector server `port` is: 6000.

If you plan to test using a `Local deployment`, you may use ngrok (an Internet tunneling service) for both<br>
this Voice API application<br>
and the Connector application<br>
with [multiple ngrok tunnels](https://ngrok.com/docs/agent/config/v2/#tunnel-configurations).

To do that, [install ngrok](https://ngrok.com/downloads).<br>
Log in or sign up with [ngrok](https://ngrok.com/),<br>
from the ngrok web UI menu, follow the **Setup and Installation** guide.

Set up two tunnels,<br>
one to forward to the local port 6000 (as the Connector application will be listening on port 6000),<br>
the other one to the local port 8000 for this Voice API application,<br>
see this [sample yaml configuration file](https://ngrok.com/docs/agent/config/v2/#define-two-tunnels-named-httpbin-and-demo) (see paragraph titled "Define two tunnels named ‘httpbin’ and ‘demo’"), but it needs port 6000 and 8000 as actual values,<br>
depending if you have a paid ngrok account or not, you may or may not be able to set (static) domain names.

Start ngrok to start both tunnels that forward to local ports 6000 and 8000, e.g.<br>
`ngrok start httpbin demo` _(per the ngrok web page example)_,

please take note of the ngrok Enpoint URL that forwards to local port 6000 as it will be needed here for this Voice API application environment variable as **`PROCESSOR_SERVER`** in one of the next sections, that URL looks like:<br>
`xxxxxxxx.ngrok.xxx` (for ngrok),<br>
or `myserver.mycompany.com:32000` (public host name and port of your Connector application server)<br>
no `port` is necessary with ngrok as public host name,<br>
that host name to specify must not have a leading protocol text such as `https://`, `wss://`, nor trailing `/`.

### Set up your Vonage Voice API application credentials and phone number

[Log in to your](https://dashboard.nexmo.com/sign-in) or [sign up for a](https://ui.idp.vonage.com/ui/auth/registration) Vonage APIs account.

Go to [Your applications](https://dashboard.nexmo.com/applications), access an existing application or [+ Create a new application](https://dashboard.nexmo.com/applications/new).

Under Capabilities section (click on [Edit] if you do not see this section):

Enable Voice
- Under Answer URL, leave HTTP GET, and enter https://\<host\>:\<port\>/answer (replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>
- Under Event URL, **select** HTTP POST, and enter https://\<host\>:\<port\>/event (replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>
Note: If you are using ngrok for this sample application, the answer URL and event URL look like:</br>
https://yyyyyyyy.ngrok.xxx/answer</br>
https://yyyyyyyy.ngrok.xxx/event</br>
- Enable "RTC (In-app voice & messaging)", and set the corresponding webhook URL.<br>
Note: If you are using ngrok for this sample application, the webhook URL looks like:<br>
https://yyyyyyyy.ngrok.xxx/rtc</br>
**Make sure RTC webhook is enabled so DTMFs from live agent to called party work**, and for optional outbound PSTN (aka PSTN #2) calls recordings.<br>

- Click on [Generate public and private key] if you did not yet create or want new ones, save the private key file in this application folder as .private.key (leading dot in the file name).</br>
**IMPORTANT**: Do not forget to click on [Save changes] at the bottom of the screen if you have created a new key set.</br>
- Link a phone number to this application if none has been linked to the application.

Please take note of your **application ID** and the **linked phone number** (as they are needed in the very next section).

For the next steps, you will need:</br>
- Your [Vonage API key](https://dashboard.nexmo.com/settings) (as **`API_KEY`**)</br>
- Your [Vonage API secret](https://dashboard.nexmo.com/settings), not signature secret, (as **`API_SECRET`**)</br>
- Your `application ID` (as **`APP_ID`**),</br>
- The **`phone number linked`** to your application (as **`SERVICE_PHONE_NUMBER`**), that's the phone number that will be seen by callees.</br>

### Local setup

Copy or rename .env-example to .env<br>
Update parameters in .env file<br>

Have Node.js installed on your system, this application has been tested with Node.js version 22.16<br>

Install required node modules with the command:<br>
 ```bash
npm install
```

Launch the application:<br>
```bash
node live-agent-and-ai-engine-app
```

Default local (not public!) of this application server `port` is: 8000.


### Optional - Audio recording of PSTN #2 leg calls

If you want to record the outbound PSTN (aka PSTN #2) calls, in .env file you update this line:</br>
RECORD_ALL_CALLS=true</br>

Audio recording files will be stored in the ./post-call-data folder.</br>

Important: Make sure there is enough disk storage as you may need to manually delete the created recording files.</br>



