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
    const key='REC|'+(r.id||i)+'|'+period;if(have.has(key))return;
    adds.push(mk({track:r.track,title:r.task,owner:r.owner,due:ymd(due),pri:r.pri,source:'Recurring',key}));
  });
  (d.events||[]).forEach(e=>{
    const ed=pd(e.date);if(!ed||td>addD(ed,2))return;
    (c.prep||[]).filter(t=>t.template===e.template).forEach((t,ti)=>{
      const due=addD(ed,+t.offset||0);if(td<addD(due,-1))return;
      const owners=String(t.who).toLowerCase()==='everyone'?team:[e.owner];
      owners.forEach(o=>{const key='EVT|'+e.id+'|'+ti+'|'+o;if(have.has(key))return;
        adds.push(mk({track:e.track,title:t.task+'  ['+e.event+']',owner:o,due:ymd(due<td?td:due),pri:t.pri,source:'Event prep',key}))});
    });
  });
  return adds;
}
function mk(o){return{id:uid(),track:o.track||'',title:o.title,owner:o.owner||'',due:o.due||'',pri:o.pri||'P2',status:'todo',source:o.source||'Manual',key:o.key||'',created:ymd(today()),doneOn:'',notes:o.notes||'',ai:o.ai||null,output:''}}
function buildBrief(d,now){
  const c=d.config||{},td=today(now),tasks=(d.tasks||[]).filter(t=>t.status!=='done'),team=c.team||[],max=c.maxTasks||5,L=[];
  L.push('*Inflekt OS - '+fday(td)+'*','');
  const mrr=(c.revenue||[]).filter(r=>/active|ending/i.test(r.status)&&(!r.start||pd(r.start)<=td)).reduce((s,r)=>s+(+r.mrr||0),0);
  const target=(+c.targetPerPerson||0)*(+c.partners||team.length||3);
  const pipe=(d.pipeline||[]).filter(p=>!/won|lost/i.test(p.stage));
  const w=pipe.reduce((s,p)=>s+(+p.retainer||0)*(+p.prob||0)/100,0);
  L.push('*NUMBERS*','MRR Rs'+mrr.toFixed(2)+'L | target Rs'+target.toFixed(2)+'L | gap Rs'+Math.max(0,target-mrr).toFixed(2)+'L','Open pipeline: '+pipe.length+' deals, weighted Rs'+w.toFixed(2)+'L/mo','','*TODAY - BY OWNER*');
  const pn=p=>+String(p).replace(/\D/g,'')||2;
  const sort=(a,b)=>((pd(a.due)||new Date(2999,0,1))-(pd(b.due)||new Date(2999,0,1)))||pn(a.pri)-pn(b.pri);
  team.forEach(p=>{
    const mine=tasks.filter(t=>t.owner===p&&(!pd(t.due)||pd(t.due)<=addD(td,1))).sort(sort);
    L.push('','*'+p+'*'+(mine.length>max?' (top '+max+' of '+mine.length+')':''));
    if(!mine.length)L.push('- Free: pick from backlog / BD outreach');
    mine.slice(0,max).forEach(t=>{const d=pd(t.due),od=d&&d<td?' - overdue '+diff(d,td)+'d':'';L.push('- ['+t.pri+'] '+t.title+(d?' ('+fshort(d)+')':'')+od+(t.ai&&!t.output?' - Claude prompt ready':''))});
  });
  const f=[],over=tasks.filter(t=>pd(t.due)&&pd(t.due)<td);
  if(over.length>=3)f.push(over.length+' tasks overdue - clear or re-date in the first 10 min.');
  (d.events||[]).forEach(e=>{const ed=pd(e.date);if(!ed)return;const dd=diff(td,ed);if(dd>=0&&dd<=3){const open=tasks.filter(t=>String(t.key).startsWith('EVT|'+e.id+'|')).length;f.push(e.event+' in '+dd+' day(s) - '+open+' prep task(s) open (owner '+e.owner+')')}});
  pipe.forEach(p=>{const lt=pd(p.last);if(!lt||diff(lt,td)>=(c.staleDays||7))f.push(p.company+': no touch '+(lt?diff(lt,td)+'d':'ever')+'. Next: '+(p.next||'define next step')+' ('+(p.owner||'no owner')+')')});
  const wk=addD(td,-7),touched=(d.pipeline||[]).filter(p=>pd(p.last)&&pd(p.last)>=wk).length;
  if(touched<(c.outreachPerWeek||5))f.push('Only '+touched+' outreach touches in 7 days (goal '+(c.outreachPerWeek||5)+')');
  const all=d.tasks||[];
  (c.tracks||[]).filter(t=>t.active!==false).forEach(t=>{const ds=all.filter(x=>x.track===t.name).map(x=>Math.max(pd(x.doneOn)||0,pd(x.created)||0));const last=ds.length?Math.max(...ds):0;if(!last||diff(new Date(last),td)>(c.quietDays||7))f.push('Track "'+t.name+'" quiet for '+(c.quietDays||7)+'+ days (owner '+t.owner+')')});
  L.push('','*WATCH-OUTS*');if(!f.length)L.push('- Nothing flagged.');f.slice(0,10).forEach(x=>L.push('- '+x));
  L.push('','Meeting starts with this list - no re-prioritising.');
  return L.join('\n');
}
const C={pad,ymd,pd,today,addD,diff,fshort,fday,uid,DOW,computeAdds,mk,buildBrief};
if(typeof module!=='undefined'&&module.exports)module.exports=C;else Object.assign(root,C);
})(typeof window!=='undefined'?window:globalThis);
