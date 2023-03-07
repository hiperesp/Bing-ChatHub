import fetch from 'node-fetch';
import WebSocket from 'ws';
import readline  from 'readline';

const BING_COOKIE = "";//insert your bing cookie here

const RECORD_SEPARATOR = String.fromCharCode(30);
const kConversationId = Symbol('conversationId');
const kClientId = Symbol('clientId');
const kConversationSignature = Symbol('conversationSignature');
const kInvocationId = Symbol('invocationId');

const TYPE_MESSAGE_PARTIAL = 1;
const TYPE_MESSAGE_FULL = 2;
const TYPE_MESSAGE_END_OF_SESSION = 3;
const TYPE_MESSAGE_TO_BE_SENT = 4;
const TYPE_MESSAGE_WILL_BE_SENT = 6;


class ChatHub {

    [kConversationId];
    [kClientId];
    [kConversationSignature];
    [kInvocationId] = 0;

    constructor() {
        fetch("https://www.bing.com/turing/conversation/create", {
            "headers": {
                "accept": "application/json",
                "cookie": BING_COOKIE,
            },
            "body": null,
            "method": "GET"
        }).then(res => res.json()).then(json => {
            this[kConversationId] = json.conversationId;
            this[kClientId] = json.clientId;
            this[kConversationSignature] = json.conversationSignature;
        });
    }

    sendText(text) {
        const currentInstance = this;

        const ws = new WebSocket('wss://sydney.bing.com/sydney/ChatHub');

        function onReady() {
            sendMessage({
                "type": TYPE_MESSAGE_WILL_BE_SENT,
            });
            sendMessage({
                "arguments": [
                    {
                        "source": "cib",
                        "optionsSets": [ "nlu_direct_response_filter", "deepleo", "disable_emoji_spoken_text", "responsible_ai_policy_235", "enablemm", "harmonyv3", "dtappid", "trn8req120", "h3ads", "rai251", "cricinfo", "cricinfov2", "dv3sugg"],
                        "allowedMessageTypes": [ "Chat", "InternalSearchQuery", "InternalSearchResult", "Disengaged", "InternalLoaderMessage", "RenderCardRequest", "AdsQuery", "SemanticSerp", "GenerateContentQuery" ],
                        "sliceIds": [ "222dtappid", "222dtappid", "302limit", "302limit", "228h3ads", "h3ads", "303rai251", "303rai251", "225cricinfo", "225cricinfo", "224locals0", "224locals0" ],
                        "isStartOfSession": currentInstance[kInvocationId] == 0,
                        "message": {
                            "locale": "pt-BR",
                            "market": "pt-BR",
                            "region": "BR",
                            "location": "lat:47.012345;long:-122.678910;re=1000m;",
                            "locationHints": [
                                {
                                    "country": "Brazil",
                                    "state": "Sao Paulo",
                                    "city": "Sao Paulo",
                                    "zipcode": "01001-000",
                                    "timezoneoffset": -3,
                                    "countryConfidence": 8,
                                    "cityConfidence": 8,
                                    "Center": {
                                        "Latitude": -23,
                                        "Longitude": -46
                                    },
                                    "RegionType": 2,
                                    "SourceType": 1
                                }
                            ],
                            "timestamp": new Date().toISOString(),
                            "author": "user",
                            "inputMethod": "Keyboard",
                            "text": text,
                            "messageType": "Chat"
                        },
                        "conversationSignature": currentInstance[kConversationSignature],
                        "participant": {
                            "id": currentInstance[kClientId]
                        },
                        "conversationId": currentInstance[kConversationId],
                    }
                ],
                "invocationId": String(currentInstance[kInvocationId]++),
                "target": "chat",
                "type": TYPE_MESSAGE_TO_BE_SENT
            })
        }

        function sendMessage(message) {
            ws.send(JSON.stringify(message) + RECORD_SEPARATOR);
        }

        ws.on('open', function() {
            sendMessage({
                "protocol": "json",
                "version": 1
            });
            onReady();
        });
        ws.on('message', function(message) {

            message = message.toString();

            const messages = message.split(RECORD_SEPARATOR);
            for (let i = 0; i < messages.length; i++) {
                const message = messages[i];
                try {
                    const JSONMessage = JSON.parse(message);
                    if(JSONMessage.type == TYPE_MESSAGE_PARTIAL) {
                        currentInstance.onPartialMessage(JSONMessage);
                    } else if(JSONMessage.type == TYPE_MESSAGE_FULL) {
                        currentInstance.onFullMessage(JSONMessage);
                    } else if(JSONMessage.type == TYPE_MESSAGE_END_OF_SESSION) {
                        ws.close();
                    }
                } catch (e) {
                }
            }
        });

        ws.on('close', function() {
        });
    }
    onPartialMessage() {}
    onFullMessage() {}
}


const chatHub = new ChatHub();

const chatHistory = [];

const botPrefix         = "\x1b[32mBOT> \x1b[0m";
const botThinkingPrefix = botPrefix+"🤔 ";
const userPrefix = "\x1b[31mUser> \x1b[0m";

function printHistory(newText) {
    function parseText(text) {
        return text;
    }
    console.clear();
    chatHistory.forEach((message) => {
        console.log(parseText(message));
    });
    if(newText) {
        console.log(parseText(newText));
    }
}
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
function ask() {
    rl.question(userPrefix, (question) => {
        chatHistory.push(userPrefix+question);
        chatHub.sendText(question);
    });
}

chatHub.onPartialMessage = function(jsonMessage) {
    const text = jsonMessage?.arguments[0]?.messages[0]?.text;
    if(!text) return;
    printHistory(botThinkingPrefix+text);
}
chatHub.onFullMessage = function(jsonMessage) {
    if(jsonMessage.item.result.value == "Throttled") {
        console.log("You are sending too many messages in 24 hours. Please try again later.");
        rl.close();
        return;
    }
    const messages = jsonMessage?.item?.messages;

    let lastMessage = messages[messages.length-1].text;
    for(let i = messages.length-1; i >= 0; i--) {
        if(messages[i].messageType == null) {
            lastMessage = messages[i].text;
            break;
        }
    }

    chatHistory.push(botPrefix+lastMessage);
    printHistory();
    console.log(jsonMessage.item.throttling.numUserMessagesInConversation+" messages sent of "+jsonMessage.item.throttling.maxNumUserMessagesInConversation+" allowed.");
    ask();
}
console.log("Hello! I'm a chatbot. Ask me anything!");
ask();