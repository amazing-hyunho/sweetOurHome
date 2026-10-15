import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {firebaseConfig} from '../public/firebase-config.js';
import {readSharedDocument,commitSharedState} from '../lib/shared-state.mjs';
import {mergeSnapshot} from '../lib/merge-snapshot.mjs';

// Import a user-supplied snapshot; no website is visited by this command.
async function jsonFile(file){
  if((await stat(file)).size>2000000)throw Error('JSON 입력 파일은 2MB 이하로 사용하세요.');
  return JSON.parse(await readFile(file,'utf8'));
}
try{
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--write'){if(options.write)throw Error('옵션 중복');options.write=true;}
    else if(['--file','--complex','--state'].includes(arg)&&args[i+1]&&!args[i+1].startsWith('--')){
      if(options[arg])throw Error('옵션 중복');options[arg]=args[++i];
    }else throw Error('사용법: npm run import:snapshot -- --file 스냅샷.json --complex 단지ID [--state 로컬백업.json | --write]');
  }
  if(!options['--file']||!options['--complex']||options.write&&options['--state'])throw Error('스냅샷과 단지 ID가 필요합니다. 로컬 미리보기에는 --write를 사용할 수 없습니다.');
  const snapshot=await jsonFile(options['--file']);
  const before=options['--state']?{state:await jsonFile(options['--state'])}:await readSharedDocument(firebaseConfig.projectId);
  const merged=mergeSnapshot(before.state,options['--complex'],snapshot);
  const changed=merged.stats.added+merged.stats.updated;
  if(options.write&&changed){
    // Save the exact pre-write data locally for recovery; CAS rejects any edit
    // that arrived after this read instead of overwriting a spouse's changes.
    const dir=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'sweetOurHome','imports');
    await mkdir(dir,{recursive:true});
    const filename=path.join(dir,`before-${Date.now()}-${randomUUID()}.json`);
    await writeFile(filename,JSON.stringify(before.state,null,2),{flag:'wx'});
    await commitSharedState(firebaseConfig.projectId,before,merged.state);
    console.log(`공동 목록에 반영했습니다. 변경 전 백업: ${filename}`);
  }
  console.log(JSON.stringify({mode:options.write?(changed?'saved':'no_change'):'preview_only',...merged.stats,...merged.summary,deleted:0},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
