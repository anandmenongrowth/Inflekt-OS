/* Inflekt OS core - shared by the web app (browser) and the 8am GitHub Action (Node). No DOM, no network. */
(function(root){
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const pd=s=>{if(!s)return null;const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?new Date(+m[1],+m[2]-1,+m[3]):null};
const today=(now)=>{const d=now||new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate())};
const addD=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
const diff=(a,b)=>Math.round((b-a)/864e5);
const fshort=d=>d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
const fday=d=>d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const DOW={sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
function computeAdds(d,now){
  const td=today(now),c=d.config||{},tasks=d.tasks||[],have=new Set(tasks.map(t=>t.key).filter(Boolean)),adds=[],team=c.team||[];
  (c.recurring||[]).forEach((r,i)=>{
    if(r.active===false)return;
    let due,period;const f=String(r.freq).toLowerCase();
    if(f==='daily'){due=td;period=ymd(td)}
    else if(f==='weekly'){const tg=DOW[String(r.day).toLowerCase().slice(0,3)];if(tg===undefined)return;const mon=addD(td,-((td.getDay()+6)%7));due=addD(mon,(tg+6)%7);period='W'+ymd(mon)}
    else if(f==='monthly'){const last=new Date(td.getFullYear(),td.getMonth()+1,0).getDate();due=new Date(td.getFullYear(),td.getMonth(),Math.min(+r.day||1,last));period=ymd(td).slice(0,7)}
    else return;
    if(td<addD(due,-(+r.lead||0)))return;
    const key='REC|'+(r.id||i)+'|'+period;if(have.has(key)||(c.skipKeys||[]).includes(key))return;
    adds.push(mk({track:r.track,title:r.task,owner:r.owner,due:ymd(due),pri:r.pri,source:'Recurring',key}));
  });
  return adds;
}
function mk(o){return{id:uid(),track:o.track||'',title:o.title,owner:o.owner||'',due:o.due||'',eta:'',waitingOn:'',waitSince:'',slips:0,log:[],pri:o.pri||'P2',status:'todo',source:o.source||'Manual',key:o.key||'',created:ymd(today()),doneOn:'',notes:o.notes||'',ai:o.ai||null,output:''}}

const pn=p=>+String(p).replace(/\D/g,'')||2;
const byDue=(a,b)=>((pd(a.due)||new Date(2999,0,1))-(pd(b.due)||new Date(2999,0,1)))||pn(a.pri)-pn(b.pri);
const isOpen=t=>t.status!=='done'&&t.status!=='dropped';
/** colour band of a task's deadline relative to today: over (red) | soon (amber: today/tomorrow) | later | none | done (green) | drop */
function band(t,td){
  if(t.status==='done')return 'done';if(t.status==='dropped')return 'drop';
  const d=pd(t.due);if(!d)return 'none';if(d<td)return 'over';if(d<=addD(td,1))return 'soon';return 'later';
}
function lastNote(t){const n=(t.log||[]).filter(x=>x.k==='note');return n.length?n[n.length-1]:null}
function statusText(t,td){
  if(t.status==='doing')return 'WIP'+(t.eta&&pd(t.eta)?', ETA '+fshort(pd(t.eta)):'');
  if(t.status==='waiting')return 'Waiting on '+(t.waitingOn||'someone')+(td&&pd(t.waitSince)?', '+diff(pd(t.waitSince),td)+'d':'');
  if(t.status==='done')return 'Done';if(t.status==='dropped')return 'Dropped';return 'Yet to start';
}
function dueText(t,td){const x=pd(t.due);if(!x)return 'No date';return fshort(x)+(x<td&&isOpen(t)?' (overdue '+diff(x,td)+'d)':'')}

/** Structured brief: draws the Today page and feeds the text version. */
function briefData(d,now){
  const c=d.config||{},td=today(now),all=d.tasks||[],open=all.filter(isOpen),team=c.team||[],max=c.maxTasks||5;
  const inWindow=t=>!pd(t.due)||pd(t.due)<=addD(td,1);   // Today only shows what is due by tomorrow (D+1); later tasks stay in the Tasks tab
  const owners=team.map(p=>{
    const mine=open.filter(t=>t.owner===p&&t.status!=='waiting'&&inWindow(t)).sort(byDue);
    return{name:p,total:mine.length,tasks:mine.slice(0,max)};
  });
  const waiting=open.filter(t=>t.status==='waiting'&&inWindow(t)).sort((a,b)=>String(a.waitSince).localeCompare(String(b.waitSince)));
  const wk=addD(td,-7);
  const mon=addD(td,-((td.getDay()+6)%7));   // Monday of the current week
  const closed=all.filter(t=>t.status==='done'&&pd(t.doneOn)&&pd(t.doneOn)>=mon&&pd(t.doneOn)<=td).sort((a,b)=>String(b.doneOn).localeCompare(String(a.doneOn)));
  const pipe=(d.pipeline||[]).filter(p=>(p.status?p.status==='Warm':!/won|lost/i.test(p.stage)));
  const f=[],over=open.filter(t=>pd(t.due)&&pd(t.due)<td);
  if(over.length>=3)f.push(over.length+' tasks overdue - clear or re-date in the first 10 min.');
  open.filter(t=>(t.slips||0)>=2).forEach(t=>f.push('Deadline moved '+t.slips+' times: '+t.title+' ('+(t.owner||'no owner')+')'));
  waiting.filter(t=>pd(t.waitSince)&&diff(pd(t.waitSince),td)>=5).forEach(t=>f.push('Waiting '+diff(pd(t.waitSince),td)+'d on '+(t.waitingOn||'someone')+': '+t.title+' - time to nudge'));
  pipe.forEach(p=>{const lt=pd(p.last);if(!lt||diff(lt,td)>=(c.staleDays||7))f.push(p.company+': no touch '+(lt?diff(lt,td)+'d':'ever')+'. Next: '+(p.next||'define next step')+' ('+(p.owner||'no owner')+')')});
  const touched=(d.pipeline||[]).filter(p=>pd(p.last)&&pd(p.last)>=wk).length;
  if(touched<(c.outreachPerWeek||5))f.push('Only '+touched+' outreach touches in 7 days (goal '+(c.outreachPerWeek||5)+')');
  const waitingMtg=(d.inbox||[]).filter(e=>e.status==='pending').length;
  if(waitingMtg)f.push(waitingMtg+' meeting'+(waitingMtg>1?'s':'')+' waiting for review in the app (Capture tab) - approve the tasks and updates');
  const quiet=[];
  (c.tracks||[]).filter(t=>t.active!==false).forEach(t=>{const ds=all.filter(x=>x.track===t.name).map(x=>Math.max(pd(x.doneOn)||0,pd(x.created)||0));const last=ds.length?Math.max(...ds):0;if(!last||diff(new Date(last),td)>(c.quietDays||7))quiet.push(t.name.replace(/^T\d+\s+/,'')+' ('+t.owner+')')});
  if(quiet.length)f.push({t:'No activity in '+(c.quietDays||7)+'+ days:',sub:quiet});
  return{date:td,owners,waiting,closed,flags:f.slice(0,10),max};
}

/** Plain text for WhatsApp / email. No symbols or markup: deadline, task, status. */
function buildBrief(d,now){
  const b=briefData(d,now),L=['INFLEKT OS - '+fday(b.date).toUpperCase(),''];
  b.owners.forEach(o=>{
    L.push(o.name.toUpperCase()+(o.total>b.max?' (top '+b.max+' of '+o.total+')':''));
    if(!o.tasks.length)L.push('Free - pick from backlog / BD outreach');
    o.tasks.forEach(t=>L.push(dueText(t,b.date)+' | '+t.title+' | '+statusText(t,b.date)));
    L.push('');
  });
  if(b.waiting.length){L.push('WAITING ON OTHERS');b.waiting.forEach(t=>L.push((t.owner||'-')+' | '+t.title+' | '+statusText(t,b.date)));L.push('')}
  if(b.closed.length){L.push('CLOSED THIS WEEK ('+b.closed.length+')');b.closed.slice(0,6).forEach(t=>L.push(fshort(pd(t.doneOn))+' | '+t.title+' | '+(t.owner||'-')));L.push('')}
  L.push('WATCH-OUTS');
  if(!b.flags.length)L.push('Nothing flagged.');
  b.flags.forEach(x=>{if(typeof x==='string')L.push('- '+x);else{L.push('- '+x.t);x.sub.forEach(s=>L.push('   - '+s))}});
  return L.join('\n');
}
const CORE_V=8;
const C={CORE_V,pad,ymd,pd,today,addD,diff,fshort,fday,uid,DOW,computeAdds,mk,byDue,isOpen,band,lastNote,statusText,dueText,briefData,buildBrief};
if(typeof module!=='undefined'&&module.exports)module.exports=C;else Object.assign(root,C);
})(typeof window!=='undefined'?window:globalThis);
