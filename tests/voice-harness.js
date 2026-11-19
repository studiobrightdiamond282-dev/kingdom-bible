/* Small Web Speech API + DOM harness for exercising the real Voice Preacher
   module in Node without claiming to test microphone hardware or a browser. */
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const KingdomRef=require('../public/bible-ref.js');

const source=fs.readFileSync(path.join(__dirname,'../public/voice.js'),'utf8');

function createVoiceHarness(hooks={}){
  const elements={};
  for(const id of ['voiceMic','voiceTr','voiceLang','voiceAuto','voiceLog','voiceStatus','voiceHint','voiceTranscript']){
    elements['#'+id]={
      innerHTML:'',textContent:'',className:'',attributes:{},
      classList:{toggle(){}},
      setAttribute(name,value){this.attributes[name]=value},
      closest(){return null},
    };
  }
  const recognitions=[];
  class FakeSpeechRecognition{
    constructor(){this.started=false;this.stopped=false;recognitions.push(this)}
    start(){this.started=true}
    stop(){this.stopped=true}
  }
  const values=new Map();
  const localStorage={
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
  };
  const location={hostname:'localhost'};
  const performance={now:()=>Date.now()};
  const window={SpeechRecognition:FakeSpeechRecognition,isSecureContext:true,location,performance,KingdomRef};
  const document={querySelector:selector=>elements[selector]||null};
  const sandbox={window,document,localStorage,location,performance,setTimeout,clearTimeout,Date,Promise};
  vm.createContext(sandbox);
  vm.runInContext(source,sandbox,{filename:'public/voice.js'});
  const voice=window.KingdomVoice;
  voice.bind(hooks);

  async function flush(){await new Promise(resolve=>setImmediate(resolve))}
  async function speak(transcript,isFinal=true){
    const recognition=recognitions[recognitions.length-1];
    if(!recognition||!recognition.onresult)return false;
    const result=[{transcript}];
    result.isFinal=!!isFinal;
    recognition.onresult({resultIndex:0,results:[result]});
    await flush();
    return true;
  }

  return{
    voice,elements,recognitions,localStorage,
    get recognition(){return recognitions[recognitions.length-1]||null},
    speak,flush,
  };
}

module.exports={createVoiceHarness};
