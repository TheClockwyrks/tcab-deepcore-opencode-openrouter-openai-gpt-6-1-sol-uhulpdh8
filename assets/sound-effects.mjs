import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=new URL('.',import.meta.url).pathname;
const config='/tmp/opencode/media-config.json';
const run=(tool,...args)=>execFileSync(tool,['--config',config,...args.map(v=>typeof v==='number'?String(Math.round(v*1000000)/1000000):String(v))],{stdio:'pipe'});
const save=v=>writeFileSync(config,JSON.stringify({...v,...('channels' in v?{channels:'mono'}:{})}));
mkdirSync(root+'audio',{recursive:true});mkdirSync(root+'fx',{recursive:true});
for(const [name,freq,dur] of [['drill',73,800],['thrust',48,1000],['ore-pickup',690,250],['material-chime',520,650],['gas-explosion',42,1000],['lava-sizzle',170,650],['impact',56,350],['fabricate',440,400],['launch',35,2500],['death',190,900],['alarm-fuel',550,350],['alarm-core',880,220]]){
 save({sample_rate:22050,channels:1,max_duration_ms:dur+500,seed:42,actions:'/tmp/opencode/sound-log.json',preview:'/tmp/opencode/sound.png',output:root+`audio/${name}.wav`,wav:root+`audio/${name}.wav`});
 run('sfx-synth','init');run('sfx-synth','add-voice','--name','tone','--wave',name.includes('explosion')||['thrust','launch','lava-sizzle','drill'].includes(name)?'noise':'triangle','--freq',freq,'--gain',-24,'--dur',dur);
 run('sfx-synth','add-voice','--name','sub','--wave','sine','--freq',freq,'--gain',-26,'--dur',dur);
 run('sfx-synth','set-pitch','--voice','sub','--slide-to',name.includes('pickup')||name==='fabricate'?freq*2:freq*.4,'--over',dur);
 run('sfx-synth','render');
}
save({sample_rate:22050,channels:1,max_duration_ms:26000,seed:42,instrument_bank:'gm-lite',actions:'/tmp/opencode/music-log.json',preview:'/tmp/opencode/music.png',wav:root+'audio/music.wav',output:root+'audio/music.wav',mid:root+'audio/music.mid'});
run('music','init');run('music','set-tempo','--bpm',80);run('music','define-track','--name','abyss','--instrument','sine');run('music','define-track','--name','echo','--instrument','triangle');
for(let i=0;i<8;i++){run('music','add-note','--track','abyss','--pitch',[33,33,29,31][i%4],'--t',i*4,'--dur',4,'--velocity',28);run('music','add-note','--track','echo','--pitch',[69,64,72,67,64,60,67,62][i],'--t',i*4+1,'--dur',2.5,'--velocity',22);}
run('music','render');
for(const [name,sample] of [['impact','impact_metal_dry'],['fabricate','mech_ratchet'],['gas-explosion','cannon_body_heavy'],['ore-pickup','mech_clip_load'],['drill','engine_diesel_idle']]){
 save({sample_rate:22050,channels:'mono',max_duration_ms:2200,seed:42,sample_pack:'combat-core',actions:'/tmp/opencode/sample-log.json',preview:'/tmp/opencode/sample.png',wav:root+`audio/${name}.wav`});
 run('sfx-sample','init');run('sfx-sample','add-sample','--name',sample,'--t',0,'--gain',-19,'--fade-out',80);run('sfx-sample','render');
}
const effects=['gas-seep','drill-debris','jetpack-exhaust','ore-sparkle','material-shimmer','gas-explosion','lava-embers','impact-dust','core-extract','core-detonation','launch-exhaust','death-burst'];
for(const name of effects){
 save({width:320,height:320,duration_ms:1600,fps:24,seed:42,actions:'/tmp/opencode/fx-log.json',preview:'/tmp/opencode/fx.gif',system:root+`fx/${name}.json`});
 run('particle-2d','init');
 const blast=name.includes('explosion')||name.includes('detonation');const seep=name==='gas-seep';const exhaust=name.includes('exhaust');
 run('particle-2d','add-emitter','--name','sparks','--shape',seep?'box':'point','--x',160,'--y',160,'--size-x',65,'--size-y',12,'--burst',seep?8:blast?110:35,'--lifetime',seep?1400:700,'--lifetime-spread',250,'--speed',seep?18:blast?210:exhaust?130:70,'--speed-spread',30,'--dir-y',exhaust?-1:1,'--cone-angle',blast?180:exhaust?20:65);
 run('particle-2d','set-particle','--emitter','sparks','--size-from',seep?1.2:blast?1.5:.6,'--size-to',seep?3:.1,'--opacity-from',seep?.15:.85,'--opacity-to',0,'--color-gradient',seep?'#bddecb@0,#76928b@1':name.includes('material')||name.includes('core-extract')?'#caffeb@0,#65d6d1@1':'#ffe6aa@0,#db8150@0.4,#655a56@1');
 if(blast){run('particle-2d','add-emitter','--name','flash','--shape','disc','--radius',2,'--x',160,'--y',160,'--burst',1,'--lifetime',260,'--speed',0);run('particle-2d','set-particle','--emitter','flash','--size-from',15,'--size-to',40,'--opacity-from',.9,'--opacity-to',0,'--color-gradient','#fff2bf@0,#e57248@1');for(let i=0;i<24;i++){const a=i*Math.PI/12;run('particle-2d','add-emitter','--name',`ring${i}`,'--shape','point','--x',160+Math.cos(a)*20,'--y',160+Math.sin(a)*20,'--burst',1,'--lifetime',440,'--speed',220,'--dir-x',Math.cos(a),'--dir-y',Math.sin(a),'--cone-angle',0);run('particle-2d','set-particle','--emitter',`ring${i}`,'--size-from',1.8,'--size-to',2.2,'--opacity-from',.75,'--opacity-to',0,'--color-gradient','#ffe6aa@0,#e9a16c@1');}}
 run('particle-2d','render');
}
