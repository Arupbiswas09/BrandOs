<script type="text/x-dc" data-dc-script="" data-props="{&quot;$preview&quot;:{&quot;width&quot;:1440,&quot;height&quot;:940},&quot;brandTakeover&quot;:{&quot;editor&quot;:&quot;enum&quot;,&quot;options&quot;:[&quot;bold&quot;,&quot;moderate&quot;,&quot;off&quot;],&quot;default&quot;:&quot;bold&quot;,&quot;tsType&quot;:&quot;'bold'|'moderate'|'off'&quot;,&quot;section&quot;:&quot;Brand house&quot;},&quot;globalAccent&quot;:{&quot;editor&quot;:&quot;color&quot;,&quot;options&quot;:[&quot;#2D4A5C&quot;,&quot;#33544A&quot;,&quot;#3B4A6B&quot;,&quot;#5B4636&quot;],&quot;default&quot;:&quot;#2D4A5C&quot;,&quot;tsType&quot;:&quot;string&quot;,&quot;section&quot;:&quot;Brand house&quot;},&quot;showActivity&quot;:{&quot;editor&quot;:&quot;boolean&quot;,&quot;default&quot;:true,&quot;tsType&quot;:&quot;boolean&quot;,&quot;section&quot;:&quot;Street&quot;}}">
class Component extends DCLogic {
  constructor(p){
    super(p);
    this.state = {
      db: this.load(),
      view:'street', vid:null, brandTab:'home',
      drawer:null, drawerTab:'overview',
      modal:null, draft:{}, step:0,
      cmdk:false, q:'', cmdkScope:'All',
      offAud:'All', offStat:'All',
      astType:'All', astStat:'All', astQ:'',
      libTab:'All', libQ:'',
      pickQ:'', pickScope:'unlinked', cmtText:'', cmtRefs:[], cmtMentions:[], itemText:'', dl:{},
      gridBy:'goal', gridByBrand:{}, inbox:false, whoOpen:false, archOpen:{},
      nudge:null
    };
    this._on = {};
    this.onKey = this.onKey.bind(this);
  }

  /* ---------------- constants ---------------- */
  TYPES(){ return {
    'Landing page':{code:'LP',cat:'campaign'},'Email':{code:'EM',cat:'campaign'},
    'Email sequence':{code:'SEQ',cat:'campaign'},'Social post':{code:'SOC',cat:'campaign'},
    'Meta ad':{code:'META',cat:'campaign'},'Google ad':{code:'ADS',cat:'campaign'},
    'Newsletter':{code:'NL',cat:'campaign'},'Video':{code:'VID',cat:'campaign'},
    'Case study':{code:'CS',cat:'campaign'},'Poster':{code:'PST',cat:'campaign'},
    'Document':{code:'DOC',cat:'campaign'},'Lead magnet':{code:'MAG',cat:'campaign'},'LinkedIn post':{code:'LI',cat:'campaign'},'Logo':{code:'LOGO',cat:'master'},
    'Guidelines':{code:'GDL',cat:'master'},'Font':{code:'FONT',cat:'master'},
    'Checklist':{code:'CHK',cat:'global'},'Prompt':{code:'PRM',cat:'global'},'Template':{code:'TPL',cat:'global'},
    'SOP':{code:'SOP',cat:'global'}
  }; }
  AUD(){ const m={'All segments':'#6E7C76'}; ((this.state&&this.state.db&&this.state.db.brands)||[]).forEach(b=>(b.segments||[]).forEach(s=>{ m[s.name]=s.color; })); return m; }
  segColor(name){ return this.AUD()[name]||'#6E7C76'; }
  CHANNELS(){ return ['Owned','Google','Meta','LinkedIn','Newsletter sponsorship','Onboarding flow','Email','Organic social','Print']; }
  ACCESS(){ return ['Admin','Editor','Reviewer','Viewer']; }
  ACCCOL(){ return {Admin:'#8156C7',Editor:'#2F8F62',Reviewer:'#C2740C',Viewer:'#6E7C76'}; }
  ACCNOTE(){ return {
    Admin:'Everything, everywhere. Invites people and is the only role that can delete.',
    Editor:'Creates, edits and archives inside their scope. Reviews and approves.',
    Reviewer:'Reads, comments, approves or sends back. Changes nothing themselves.',
    Viewer:'Reads. Useful for people who need to find things, not change them.'
  }; }
  PERM(){ return {
    Admin:{edit:1,archive:1,del:1,review:1,comment:1,access:1},
    Editor:{edit:1,archive:1,del:0,review:1,comment:1,access:0},
    Reviewer:{edit:0,archive:0,del:0,review:1,comment:1,access:0},
    Viewer:{edit:0,archive:0,del:0,review:0,comment:0,access:0}
  }; }
  can(k,uid){ const u=this.user(uid||this.meId()); return !!(this.PERM()[u.access||'Viewer']||{})[k]; }
  group(id){ return (this.db.groups||[]).find(g=>g.id===id)||null; }
  scopeOf(uid){
    const u=this.user(uid);
    if(u.all) return {all:true,clients:[],brands:[]};
    let cl=(u.clients||[]).slice(), br=(u.brands||[]).slice();
    (u.groups||[]).forEach(gid=>{ const g=this.group(gid); if(g){ cl=cl.concat(g.clients||[]); br=br.concat(g.brands||[]); } });
    return {all:false,clients:cl,brands:br};
  }
  seesClient(cid,uid){
    const s=this.scopeOf(uid||this.meId()); if(s.all) return true;
    if(s.clients.indexOf(cid)>=0) return true;
    return this.db.brands.some(b=>b.clientId===cid&&s.brands.indexOf(b.id)>=0);
  }
  seesBrand(bid,uid){
    const s=this.scopeOf(uid||this.meId()); if(s.all) return true;
    if(s.brands.indexOf(bid)>=0) return true;
    const b=this.brand(bid); if(!b) return false;
    if(s.clients.indexOf(b.clientId)>=0) return true;
    return !!(b.parentId&&s.brands.indexOf(b.parentId)>=0);
  }
  scopeLabel(uid){
    const u=this.user(uid); if(u.all) return 'Every client';
    const gs=(u.groups||[]).map(g=>(this.group(g)||{}).name).filter(Boolean);
    const cs=(u.clients||[]).map(c=>(this.client(c)||{}).name).filter(Boolean);
    const bs=(u.brands||[]).map(b=>(this.brand(b)||{}).name).filter(Boolean);
    const parts=gs.concat(cs).concat(bs);
    return parts.length?parts.join(' · '):'Nothing yet';
  }
  // ---------- archiving ----------
  isArch(x){ return !!(x&&x.archived); }
  live(list){ return list.filter(x=>!x.archived); }
  arch(list){ return list.filter(x=>x.archived); }
  expander(V,key,list,mapFn,noun){
    const open=this.archKey(key), a=this.arch(list), n=a.length, w=noun||'item';
    V[key+'Arch']=open?a.map(mapFn):[];
    V[key+'ArchAny']=n>0;
    V[key+'ArchLabel']=(open?'Hide the ':'')+n+' archived '+(n===1?w:w+'s');
    V[key+'ArchToggle']=()=>this.toggleArch(key);
    return this.live(list);
  }
  archKey(k){ return !!(this.state.archOpen||{})[k]; }
  toggleArch(k){ this.setState(s=>({archOpen:Object.assign({},s.archOpen,{[k]:!(s.archOpen||{})[k]})})); }
  setArchived(kind,id,on){
    if(!this.can('archive')) return;
    const map={client:'clients',brand:'brands',service:'services',offer:'offers',asset:'assets'};
    this.commit(db=>{
      const arr=db[map[kind]]; if(!arr) return;
      const i=arr.findIndex(x=>x.id===id); if(i<0) return;
      arr[i].archived=!!on; arr[i].ago='just now';
      this.logAct(db,on?'archived':'restored',kind,id,arr[i].name||arr[i].text||'','');
    },'archive');
  }
  GOALPAL(){ return ['#8156C7','#2D6FA8','#2F8F62','#C2740C','#C2410C','#0E7490','#7C6AC4','#B4553A']; }
  DEFAULTGOALS(){ return [
    {name:'Awareness',description:'Be known by people who have never heard of us.'},
    {name:'Audience growth',description:'Grow the audience we own — list, followers, members.'},
    {name:'Revenue',description:'Turn interest into money, one-off or recurring.'},
    {name:'Retention',description:'Keep and deepen the relationships we already have.'},
    {name:'Recruitment',description:'Ask for time rather than money — volunteers, coaches, staff.'}
  ]; }
  goalsOf(bid){ const b=this.brand(bid); return (b&&b.goals)?b.goals:[]; }
  goalNamesOf(bid){ return this.goalsOf(bid).map(g=>g.name); }
  goalColor(bid,name){ const gs=this.goalsOf(bid); const i=gs.findIndex(g=>g.name===name); const p=this.GOALPAL(); return i>=0?p[i%p.length]:'#6E7C76'; }
  OTYPES(){ return ['Audit','Free consultation','Lead magnet','Content series','Paid engagement','Campaign']; }
  DELIVERY(){ return ['Designed page','Doc link','File download','Email sequence','None']; }
  REVIEW(){ return ['None','In review','Changes requested','Approved']; }
  REVCOL(){ return {'None':'#93A09A','In review':'#C99A2E','Changes requested':'#C2410C','Approved':'#2F8F62'}; }
  CHANCOL(){ return {'Owned':'#5C6B64','Google':'#2D6FA8','Meta':'#4B62C4','LinkedIn':'#1D6FA3','Newsletter sponsorship':'#8156C7','Onboarding flow':'#0E7490','Email':'#2F8F62','Organic social':'#C2740C','Print':'#6E7C76'}; }
  OSTAT(){ return {'Ideation':'#7C6AC4','Active':'#2F8F62','Paused':'#C99A2E','Archived':'#9AA6A0'}; }
  ASTAT(){ return {'Draft':'#9AA6A0','Ready':'#2D6FA8','Live':'#1F7A55','Archived':'#B8C2BD'}; }

  /* ---------------- colour helpers ---------------- */
  rgb(hex){ const h=String(hex||'#000').replace('#',''); const s=h.length===3?h.split('').map(c=>c+c).join(''):h; const n=parseInt(s,16)||0; return [(n>>16)&255,(n>>8)&255,n&255]; }
  hexA(hex,a){ const c=this.rgb(hex); return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')'; }
  onColor(hex){ const c=this.rgb(hex); return (c[0]*0.299+c[1]*0.587+c[2]*0.114)>168?'#101614':'#FFFFFF'; }

  /* ---------------- persistence ---------------- */
  key(){ return 'brandos.v3d.db'; }
  load(){ try{ const r=localStorage.getItem(this.key()); if(r){ const d=JSON.parse(r); if(d&&d.brands) return d; } }catch(e){} return this.seed(); }
  persist(db){ try{ localStorage.setItem(this.key(), JSON.stringify(db)); }catch(e){} }
  commit(fn,perm){
    const need=(perm===undefined)?'edit':perm;
    if(need!==null&&!this.can(need)) return;
    this.setState(s=>{ const db=JSON.parse(JSON.stringify(s.db)); fn(db); this.persist(db); return {db}; });
  }
  uid(p){ return p+Math.random().toString(36).slice(2,8); }
  logAct(db,action,type,id,label,field){ db.activity.unshift({id:this.uid('ac'),user:this.meId(),action,type,id,label,field:field||'',ago:'just now'}); if(db.activity.length>50) db.activity.length=50; }

  /* ---------------- seed ---------------- */
  seed(){
    const users=[
      {id:'pr',name:'Priya Raman',initials:'PR',role:'Strategy lead'},
      {id:'ta',name:'Tom Aldridge',initials:'TA',role:'Paid media'},
      {id:'ib',name:'Ines Batz',initials:'IB',role:'Design'},
      {id:'jw',name:'Joss Weekes',initials:'JW',role:'Client lead'},
      {id:'do',name:'Dana Okafor',initials:'DO',role:'Copy and content'},
      {id:'mv',name:'Marta Vieira',initials:'MV',role:'Account director'}
    ];
    const groups=[
      {id:'g1',name:'Nonprofit pod',clients:['cl1','cl2'],note:'Everyone who touches faith and community work.'},
      {id:'g2',name:'Sport and outdoors',clients:['cl3'],note:'Northgate and anything seasonal.'}
    ];
    const ACC={pr:{access:'Admin',all:true},jw:{access:'Admin',all:true},
      do:{access:'Editor',groups:['g1']},ib:{access:'Editor',brands:['br1']},
      ta:{access:'Reviewer',all:true},mv:{access:'Viewer',groups:['g2']}};
    users.forEach(u=>Object.assign(u,{all:false,clients:[],brands:[],groups:[]},ACC[u.id]||{}));
    const clients=[
      {id:'cl1',name:'Quokka For Good',kind:'Our agency · nonprofit growth',contact:'pr',since:'2021',note:'Us. Everything we sell to nonprofits lives here, positioned once per segment so nobody rewrites it from memory.'},
      {id:'cl2',name:'St Aidan Parish',kind:'Church · Bristol',contact:'do',since:'2024',note:'Annual giving and the Christmas appeal. The parish brand plus a separate youth identity.'},
      {id:'cl3',name:'Northgate Athletics Trust',kind:'Sports nonprofit · Leeds',contact:'jw',since:'2025',note:'Season intake and corporate squad sponsorship.'},
      {id:'cl4',name:'Harlow Community Trust',kind:'Community foundation · Essex',contact:'pr',since:'2022',note:'Retainer ended March 2026. Kept for the case study and the grant numbers.',archived:true}
    ];
    const brands=[
      {id:'br1',clientId:'cl1',parentId:null,name:'Quokka For Good',mark:'QG',tagline:'Nonprofit growth, argued three ways.',primary:'#1F6F5C',secondary:'#E8B44A',owner:'pr',team:6,
       description:'Our own house. Four services, three segments, five angles — every combination either exists here or is visibly missing.',
       voice:'Warm and specific. Name the number. Never write "make a difference".',
       boilerplate:'Quokka For Good helps nonprofits grow audience, donations and volunteers through paid search, web and reporting.',
       segments:[{name:'Church',color:'#7C6AC4'},{name:'Education',color:'#2D6FA8'},{name:'Sports nonprofit',color:'#C2740C'},{name:'All segments',color:'#6E7C76'}],
       fonts:[{name:'Instrument Serif',role:'Headings',files:'2 files · woff2, otf'},{name:'Instrument Sans',role:'Body and UI',files:'4 files · woff2'}],
       colours:[{name:'Mangrove',hex:'#1F6F5C',usage:'Primary. Buttons, links, headings.'},{name:'Sand Gold',hex:'#E8B44A',usage:'Secondary. Emphasis only.'},{name:'Ink',hex:'#14201C',usage:'Body text.'},{name:'Shell',hex:'#F4F7F5',usage:'Surfaces and section fills.'}],
       guidelines:[{name:'Brand Guidelines 2026.pdf',size:'8.4 MB'},{name:'Tone of voice one-pager.pdf',size:'420 KB'}]},
      {id:'br2',clientId:'cl2',parentId:null,name:'St Aidan Parish',mark:'SA',tagline:'A church that shows its working.',primary:'#6B4E9E',secondary:'#C9A227',owner:'do',team:2,
       description:'Parish-wide identity for giving, services and community work.',
       voice:'Plain and unhurried. Speak to one person, not a congregation.',
       boilerplate:'St Aidan Parish has served the Bedminster community since 1878.',
       segments:[{name:'Parishioners',color:'#6B4E9E'},{name:'Local families',color:'#2F8F62'},{name:'Donors',color:'#C9A227'},{name:'All segments',color:'#6E7C76'}],
       fonts:[{name:'Instrument Sans',role:'All type',files:'4 files · woff2'}],
       colours:[{name:'Vespers',hex:'#6B4E9E',usage:'Primary.'},{name:'Brass',hex:'#C9A227',usage:'Secondary.'},{name:'Ink',hex:'#191424',usage:'Body text.'}],
       guidelines:[{name:'Parish identity notes.pdf',size:'1.6 MB'}]},
      {id:'br3',clientId:'cl2',parentId:'br2',name:'St Aidan Youth',mark:'SY',tagline:'Thursday nights, all welcome.',primary:'#C9622A',secondary:'#2F7A6B',owner:'do',team:1,
       description:'Separate identity for the youth programme. Deliberately does not look like the parish.',
       voice:'Direct and unfussy. No church vocabulary unless a young person used it first.',
       boilerplate:'St Aidan Youth runs free weekly sessions for 11 to 18 year olds.',
       segments:[{name:'Young people',color:'#C9622A'},{name:'Parents',color:'#2F7A6B'},{name:'All segments',color:'#6E7C76'}],
       fonts:[{name:'Instrument Sans',role:'All type',files:'4 files · woff2'}],
       colours:[{name:'Ember',hex:'#C9622A',usage:'Primary.'},{name:'Pitch Green',hex:'#2F7A6B',usage:'Secondary.'}],
       guidelines:[]},
      {id:'br4',clientId:'cl3',parentId:null,name:'Northgate Athletics',mark:'NA',tagline:'Every kid gets a lane.',primary:'#1D6FA3',secondary:'#E0553B',owner:'jw',team:3,
       description:'Membership, intake and sponsorship for a community athletics trust.',
       voice:'Encouraging, never patronising. Talk about effort, not talent.',
       boilerplate:'Northgate Athletics Trust runs subsidised track and field for 600 young athletes across Leeds.',
       segments:[{name:'Young athletes',color:'#1D6FA3'},{name:'Parents',color:'#2F8F62'},{name:'Corporate sponsors',color:'#E0553B'},{name:'All segments',color:'#6E7C76'}],
       fonts:[{name:'Instrument Sans',role:'All type',files:'4 files · woff2'}],
       colours:[{name:'Track Blue',hex:'#1D6FA3',usage:'Primary.'},{name:'Lane Red',hex:'#E0553B',usage:'Secondary.'},{name:'Ink',hex:'#101820',usage:'Body text.'}],
       guidelines:[{name:'Trust brand book.pdf',size:'4.1 MB'}]}
    ];
    const services=[
      {id:'sv1',brandId:'br1',name:'Google Ad Grant',short:'Ten thousand a month, actually spent',owner:'pr',ago:'2 hours ago',
       description:'Account rebuild and ongoing management of the Google Ad Grant. The same capability, argued differently depending on whether the nonprofit wants reach, money or people.'},
      {id:'sv2',brandId:'br1',name:'Website Design',short:'Pages that finish the job',owner:'ib',ago:'yesterday',
       description:'Landing pages, donation pages and event pages. Sold as one service, positioned per page type because the buying reason differs.'},
      {id:'sv3',brandId:'br1',name:'Impact Report',short:'Last year, made legible',owner:'do',ago:'3 days ago',
       description:'The annual report. Three completely different arguments live inside this one service, and mixing them is why most impact reports read like nothing.'},
      {id:'sv4',brandId:'br1',name:'Google Workspace',short:'Free tier, set up properly',owner:'ta',ago:'1 week ago',
       description:'Nonprofit Workspace provisioning and migration. Barely marketed yet — two segments written, one missing.'},
      {id:'sv5',brandId:'br2',name:'Annual Giving',short:'The year of asking',owner:'do',ago:'yesterday',
       description:'Christmas appeal, weekly giving and legacy conversations under one plan.'},
      {id:'sv6',brandId:'br3',name:'Youth Programme',short:'Thursday nights, filled',owner:'do',ago:'5 days ago',
       description:'Recruitment and retention for the weekly youth sessions.'},
      {id:'sv7',brandId:'br4',name:'Season Membership',short:'Intake and renewal',owner:'jw',ago:'2 days ago',
       description:'Spring intake, renewals and corporate squad sponsorship.'}
    ];
    const angles=[
      {id:'an1',brandId:'br1',name:'Grow audience',description:'Reach people who have never heard of the organisation.'},
      {id:'an2',brandId:'br1',name:'Increase donors',description:'Turn attention into money, one-off or recurring.'},
      {id:'an3',brandId:'br1',name:'Inform subscribers',description:'Keep the people who already care up to date without asking for anything.'},
      {id:'an4',brandId:'br1',name:'Recruit volunteers',description:'Ask for time instead of money.'},
      {id:'an5',brandId:'br1',name:'Build long-term',description:'Argue for the relationship, not the transaction.'},
      {id:'an6',brandId:'br2',name:'Increase donors',description:'Grow regular and one-off giving from the parish and beyond.'},
      {id:'an7',brandId:'br2',name:'Build long-term',description:'Legacy giving and multi-year commitment.'},
      {id:'an8',brandId:'br3',name:'Recruit volunteers',description:'Adult helpers and older-teen leaders.'},
      {id:'an9',brandId:'br3',name:'Grow audience',description:'Get more young people through the door on a Thursday.'},
      {id:'an10',brandId:'br4',name:'Grow audience',description:'Fill the spring intake.'},
      {id:'an11',brandId:'br4',name:'Build long-term',description:'Multi-season sponsorship and renewals.'},
      {id:'an12',brandId:'br4',name:'Recruit volunteers',description:'Coaches, marshals and parent helpers.'}
    ];
    const O=(id,brandId,serviceId,name,short,segment,ang,status,owner,ago,positioning,promise,proof,primaryCta,secondaryCta,tags)=>({id,brandId,serviceId,name,short,segment,angles:ang,status,owner,ago,positioning,promise,proof,primaryCta,secondaryCta,tags});
    const offers=[
      O('of1','br1','sv1','Ad Grant for Church Reach','Fill the pews from search','Church',['an1'],'Active','pr','2 hours ago',
        'Every week somebody in your parish searches for a church and finds a directory listing instead of you.',
        'First page for every local church query inside ninety days.','Eleven parishes, average 4.2x lift in new-visitor enquiries.','ct1','ct2',['grant','church','search']),
      O('of2','br1','sv1','Ad Grant for School Enrolment','Reach families who are looking','Education',['an1'],'Active','pr','yesterday',
        'Parents research schools for months before they call. The grant puts you in that research.',
        'Own the local enrolment search before open day.','Two academy trusts, 3.1x enquiry volume year on year.','ct1','ct2',['grant','education']),
      O('of3','br1','sv1','Ad Grant for Club Sign-ups','Find the kids not yet playing','Sports nonprofit',['an1'],'Ideation','jw','4 days ago',
        'Clubs recruit through word of mouth and then wonder why the same families keep turning up.',
        'A steady intake that does not depend on who knows who.','Not written yet. First club pilot starts in March.','ct1','',['grant','sports']),
      O('of4','br1','sv1','Ad Grant for Church Giving','Turn search into giving','Church',['an2'],'Active','pr','3 days ago',
        'The grant cannot buy donations directly, but it can carry someone from a question to a giving page in two clicks.',
        'A third of grant traffic reaching a giving page.','St Aidan: 22 percent of new regular givers arrived through search.','ct3','ct1',['grant','church','donations']),
      O('of5','br1','sv1','Ad Grant for School Fundraising','Fund the thing the budget will not','Education',['an2'],'Ideation','do','1 week ago',
        'Every school has one project the budget will never cover. That project is the campaign.',
        'One funded project per academic year, paid for by search traffic.','Draft. Needs a proof point before this goes out.','ct3','',['grant','education','donations']),
      O('of6','br1','sv1','Ad Grant for Volunteer Recruitment','Ask for time, not money','Sports nonprofit',['an4'],'Active','jw','5 days ago',
        'Clubs die from a shortage of coaches, not a shortage of children.',
        'Twelve new volunteer applications a quarter.','Northgate filled six coaching slots in seven weeks.','ct4','',['grant','volunteers']),
      O('of7','br1','sv2','Campaign Landing Page','One page, every channel','All segments',['an1','an2'],'Active','ib','yesterday',
        'One page that Meta ads, search ads and a newsletter sponsorship can all point at without contradicting each other.',
        'A single page live within ten working days.','Fourteen campaigns run off this page structure.','ct5','ct1',['web','landing']),
      O('of8','br1','sv2','Donation Page Rebuild','Stop losing people at checkout','All segments',['an2'],'Active','ib','4 days ago',
        'Most nonprofit donation pages lose two thirds of the people who arrive ready to give.',
        'Cut donation page abandonment by half.','Average completion up from 31 to 68 percent across nine rebuilds.','ct3','ct5',['web','donations']),
      O('of9','br1','sv2','Event Donation Page','A page that closes on the night','Church',['an2'],'Active','ib','1 week ago',
        'An event raises the most money in the ninety minutes people are still in the room.',
        'A page that works on a phone, in a hall, on bad wifi.','St Aidan harvest supper: 41 percent of gifts made in-room.','ct3','',['web','event','church']),
      O('of10','br1','sv3','Impact Report for Donor Growth','A report that asks','All segments',['an2'],'Active','do','3 days ago',
        'The impact report is the only document a lapsed donor will still open. Treat it as an ask, not an archive.',
        'A report that pays for itself in reactivated giving.','Three clients, average 18 percent lapsed-donor reactivation.','ct3','ct6',['report','donors']),
      O('of11','br1','sv3','Impact Report for Subscribers','A report that just tells you','All segments',['an3'],'Active','do','3 days ago',
        'Some readers are already convinced. Asking them again is how you lose them.',
        'A version with no ask in it at all.','Unsubscribes fell 40 percent on the no-ask edition.','ct6','',['report','subscribers']),
      O('of12','br1','sv3','Impact Report for Long-Term Trust','A report a funder can cite','Education',['an5'],'Ideation','do','2 weeks ago',
        'Institutional funders do not read stories. They read the same four numbers, year on year, and check whether you changed the method.',
        'A report that survives a due-diligence read.','In progress with two trust funders.','','',['report','funders']),
      O('of13','br1','sv4','Workspace for Churches','Free tier, set up properly','Church',['an5'],'Ideation','ta','1 week ago',
        'Most parishes run on one shared inbox and a personal Dropbox. That is a safeguarding problem before it is an IT problem.',
        'Every volunteer on their own account within a fortnight.','Two parishes migrated. Written up but never marketed.','','',['workspace','church']),
      O('of14','br1','sv4','Workspace for Schools','Shared drives that survive staff turnover','Education',['an5'],'Paused','ta','1 month ago',
        'When a teacher leaves, the files should not leave with them.',
        'Nothing important living in a personal account.','One trust, 340 accounts migrated.','','',['workspace','education']),
      O('of15','br1',null,'Free Marketing Audit','The way in','All segments',['an1'],'Active','pr','6 hours ago',
        'A free audit that names one specific number in the reader account. It sits above every service and feeds all of them.',
        'A booked call within two weeks of the audit landing.','Highest-converting thing we own. 38 percent of new clients started here.','ct1','ct2',['audit','acquisition']),
      O('of16','br1',null,'Partner Co-Marketing','Borrow someone else audience','All segments',['an5'],'Ideation','pr','2 weeks ago',
        'Other nonprofit suppliers reach the same people we do and are not competitors.',
        'Four co-marketing partners inside a year.','One pilot with a donation platform.','','',['partners']),
      O('of17','br2','sv5','Christmas Appeal','The one ask of the year','Donors',['an6'],'Active','do','yesterday',
        'One appeal, one number, one deadline. Everything else the parish sends is not an ask.',
        'Beat last Christmas by a fifth.','2025 appeal raised 41k against a 34k target.','ct7','',['appeal','christmas']),
      O('of18','br2','sv5','Weekly Giving','Regular, quiet, reliable','Parishioners',['an7'],'Active','do','1 week ago',
        'A standing order is a decision made once. The envelope is a decision made fifty-two times.',
        'Half of regular givers on standing order.','Standing orders up from 88 to 141 households.','ct7','ct8',['giving','recurring']),
      O('of19','br3','sv6','Thursday Night Sign-ups','Get them through the door','Young people',['an9'],'Active','do','5 days ago',
        'Free, warm, no questions, no faith requirement. That is the whole pitch and it works better unadorned.',
        'Forty regulars by the summer.','Attendance up from 12 to 31 since January.','','',['youth','recruitment']),
      O('of20','br4','sv7','Spring Intake','Fill the lanes','Young athletes',['an10'],'Active','jw','2 days ago',
        'Every child who tries athletics once in spring is three times more likely to still be running at sixteen.',
        'Two hundred new athletes across the spring intake.','2025 intake: 174 sign-ups, 71 percent retained to autumn.','ct9','',['intake','season']),
      O('of21','br4','sv7','Sponsor A Squad','Local money, local kids','Corporate sponsors',['an11'],'Active','jw','1 week ago',
        'A squad sponsorship costs less than a fortnight of local radio and puts a logo on eleven kids every Saturday.',
        'Twelve squads sponsored for a full season.','Nine squads sponsored in 2025, seven renewed.','ct10','',['sponsorship','b2b'])
    ];
    const ctas=[
      {id:'ct1',brandId:'br1',text:'Book a Free Audit',bg:'#1F6F5C',fg:'#FFFFFF',style:'solid',url:'quokkaforgood.org/audit'},
      {id:'ct2',brandId:'br1',text:'See the Playbook',bg:'transparent',fg:'#1F6F5C',style:'outline',url:'quokkaforgood.org/playbook'},
      {id:'ct3',brandId:'br1',text:'Fix My Donation Page',bg:'#E8B44A',fg:'#14201C',style:'solid',url:'quokkaforgood.org/donation-pages'},
      {id:'ct4',brandId:'br1',text:'Recruit Volunteers',bg:'#1F6F5C',fg:'#FFFFFF',style:'solid',url:'quokkaforgood.org/volunteers'},
      {id:'ct5',brandId:'br1',text:'See Example Pages',bg:'transparent',fg:'#1F6F5C',style:'outline',url:'quokkaforgood.org/work'},
      {id:'ct6',brandId:'br1',text:'Read the Sample Report',bg:'transparent',fg:'#1F6F5C',style:'outline',url:'quokkaforgood.org/impact-sample'},
      {id:'ct7',brandId:'br2',text:'Give Now',bg:'#6B4E9E',fg:'#FFFFFF',style:'solid',url:'staidan.org/give'},
      {id:'ct8',brandId:'br2',text:'Set Up a Standing Order',bg:'transparent',fg:'#6B4E9E',style:'outline',url:'staidan.org/regular'},
      {id:'ct9',brandId:'br4',text:'Join the Intake',bg:'#1D6FA3',fg:'#FFFFFF',style:'solid',url:'northgateathletics.org/intake'},
      {id:'ct10',brandId:'br4',text:'Sponsor a Squad',bg:'#E0553B',fg:'#FFFFFF',style:'solid',url:'northgateathletics.org/sponsor'}
    ];
    const A=(id,brandId,name,type,channel,status,offs,owner,ago,extra)=>Object.assign({
      id,brandId,name,type,channel,status,owner,ago,version:1,short:'',tags:[],url:'',notes:'',
      copy:null,files:[],specs:'',audienceNotes:'',aiPrompt:'',ctaId:null,clientVisible:false,
      isTemplate:false,clonedFrom:null,_o:offs||[]
    },extra||{});
    const assets=[
      A('as1','br1','Free Audit Landing Page','Landing page','Owned','Live',['of15','of1','of4','of7'],'pr','2 hours ago',{version:6,short:'The page everything points at',url:'quokkaforgood.org/audit',ctaId:'ct1',clientVisible:true,tags:['landing','evergreen','all-channel'],
        copy:{headline:'Your Google Ad Grant is worth ten thousand a month. We will tell you exactly how much of it you are wasting.',body:'Send us read-only access. Two weeks later you get a plan your own team can run, whether or not you hire us.',cta:'Book a Free Audit'},
        files:[{name:'audit-lp.figma',size:'4.2 MB'},{name:'hero-search-results.png',size:'1.1 MB'}],
        notes:'Four offers point here, across two services. Meta, Google and both sponsorships all land on this page. Do not fork it without asking Priya.',specs:'Desktop 1440, mobile 390. CTA above the fold on both.'}),
      A('as2','br1','Meta Ads — Church Giving','Meta ad','Meta','Review',['of4','of9'],'do','5 hours ago',{version:2,short:'Lapsed-giver retargeting',tags:['meta','retargeting'],specs:'1080x1080 and 1080x1350, four variants.',audienceNotes:'Lookalike from existing regular givers, excluding current standing orders.',aiPrompt:'Write four ad variants for lapsed church donors that name the specific fund, never the word blessed.'}),
      A('as3','br1','Google Search Ads — Grant Intent','Google ad','Google','Live',['of1','of2','of15'],'pr','yesterday',{version:4,short:'Exact-match grant queries',tags:['search','ads'],specs:'15 headlines, 4 descriptions, 3 ad groups.',audienceNotes:'Exact and phrase match on grant management intent, UK only.'}),
      A('as4','br1','Nonprofit Weekly Sponsorship','Newsletter ad','Newsletter sponsorship','Live',['of15'],'do','4 days ago',{version:2,short:'Primary slot, 22k readers',tags:['sponsorship','paid'],
        copy:{headline:'Most nonprofits spend a third of their ad grant. Find out what yours is doing.',body:'A free two-week audit from Quokka For Good. No pitch unless you ask for one.',cta:'Book a Free Audit'},
        notes:'Booked quarterly. Points at the same audit page as the Meta and Google work.'}),
      A('as5','br1','Donorbox Onboarding Sponsorship','Newsletter ad','Onboarding flow','Approved',['of15','of8'],'do','1 week ago',{short:'Step 3 of their signup flow',tags:['sponsorship','partner'],
        notes:'Placed inside another product onboarding flow, so the reader has already decided to fundraise. Highest intent placement we buy.'}),
      A('as6','br1','Church Case Study — St Aidan','Case study','Owned','Approved',['of1','of4','of9'],'pr','1 week ago',{version:2,short:'22 percent of new givers',clientVisible:true,tags:['proof','church'],files:[{name:'st-aidan-case-study.pdf',size:'2.1 MB'}],notes:'The strongest church proof we have. Reused across three offers in two services.'}),
      A('as7','br1','Donation Page Teardown Deck','Document','Owned','Live',['of8','of9'],'ib','4 days ago',{version:3,short:'Nine rebuilds, before and after',tags:['proof','web'],files:[{name:'donation-teardowns.pdf',size:'11.4 MB'}]}),
      A('as8','br1','Impact Report Sample — Donor Edition','Document','Owned','Approved',['of10'],'do','3 days ago',{short:'The version that asks',ctaId:'ct6',clientVisible:true,files:[{name:'impact-sample-donor.pdf',size:'6.8 MB'}]}),
      A('as9','br1','Impact Report Sample — Subscriber Edition','Document','Owned','Approved',['of11'],'do','3 days ago',{short:'The version with no ask',ctaId:'ct6',clientVisible:true,files:[{name:'impact-sample-subscriber.pdf',size:'6.2 MB'}]}),
      A('as10','br1','Volunteer Recruitment Email','Email','Email','Live',['of6'],'jw','5 days ago',{version:2,short:'Coach and marshal outreach',ctaId:'ct4',
        copy:{headline:'Your club does not need more children. It needs two more adults on a Tuesday.',body:'Ninety minutes a week, no coaching badge required to start.',cta:'Recruit Volunteers'}}),
      A('as11','br1','Sports Club Landing Page','Landing page','Owned','Draft',['of3','of6'],'jw','4 days ago',{short:'Club intake page',tags:['landing','sports'],notes:'Blocked on the sports proof point. Offer is still in ideation.'}),
      A('as12','br1','Workspace for Churches One-Pager','Document','Owned','Draft',['of13'],'ta','1 week ago',{short:'Safeguarding-first pitch',tags:['workspace']}),
      A('as13','br1','Ad Grant Compliance Checklist','Document','Owned','Approved',[],'pr','3 weeks ago',{version:2,short:'5 percent CTR rules',clientVisible:true,files:[{name:'grant-compliance.pdf',size:'840 KB'}],notes:'Not linked to any offer. Probably belongs on all six Ad Grant offers.'}),
      A('as14','br1','Campaign Landing Page Template','Template','Owned','Approved',[],'ib','2 months ago',{isTemplate:true,short:'The page structure we reuse',tags:['template','web']}),
      A('as15','br1','Impact Report Template','Template','Owned','Approved',[],'do','2 months ago',{isTemplate:true,short:'Three-edition master',tags:['template','report']}),
      A('as16','br1','Primary Logo','Logo','Owned','Approved',[],'pr','5 months ago',{short:'Full lockup, all formats',files:[{name:'qfg-logo.svg',size:'42 KB'},{name:'qfg-logo-white.svg',size:'40 KB'},{name:'qfg-icon.svg',size:'12 KB'}]}),
      A('as17','br1','Brand Guidelines 2026','Guidelines','Owned','Approved',[],'pr','2 months ago',{version:2,files:[{name:'brand-guidelines-2026.pdf',size:'8.4 MB'}]}),
      A('as18','br1','Brand Typeface Files','Font','Owned','Approved',[],'pr','5 months ago',{files:[{name:'InstrumentSerif.woff2',size:'64 KB'},{name:'InstrumentSans.woff2',size:'88 KB'}]}),
      A('as19','br2','Christmas Appeal Landing Page','Landing page','Owned','Live',['of17'],'do','yesterday',{version:3,short:'One number, one deadline',url:'staidan.org/christmas',ctaId:'ct7',clientVisible:true,tags:['appeal'],
        copy:{headline:'Thirty-four thousand pounds keeps the hall open all winter.',body:'The warm space runs six days a week from November. This is what it costs.',cta:'Give Now'}}),
      A('as20','br2','Appeal Letter — Print','Document','Owned','Approved',['of17'],'do','1 week ago',{short:'Pew and post version',files:[{name:'appeal-letter-2026.pdf',size:'1.9 MB'}],specs:'A4, two colour.'}),
      A('as21','br2','Standing Order Explainer','Email','Email','Review',['of18'],'do','2 days ago',{short:'Envelope to standing order',ctaId:'ct8'}),
      A('as22','br2','St Aidan Parish Logo','Logo','Owned','Approved',[],'do','1 year ago',{files:[{name:'st-aidan-logo.svg',size:'31 KB'}]}),
      A('as23','br3','Thursday Night Poster','Poster','Owned','Live',['of19'],'do','5 days ago',{short:'School noticeboards',files:[{name:'thursday-a3.pdf',size:'2.4 MB'}],specs:'A3, full bleed.'}),
      A('as24','br3','Youth Instagram Set','Social post','Organic social','Approved',['of19'],'do','1 week ago',{short:'Nine-post grid',specs:'1080x1350.'}),
      A('as25','br3','St Aidan Youth Logo','Logo','Owned','Approved',[],'do','8 months ago',{files:[{name:'sy-logo.svg',size:'26 KB'}]}),
      A('as26','br4','Spring Intake Landing Page','Landing page','Owned','Live',['of20'],'jw','2 days ago',{version:4,short:'Intake sign-up',url:'northgateathletics.org/intake',ctaId:'ct9',clientVisible:true,tags:['intake'],
        copy:{headline:'Every child who tries athletics once is three times more likely to still be running at sixteen.',body:'Six free taster sessions across April. No kit, no club, no cost.',cta:'Join the Intake'}}),
      A('as27','br4','Intake Google Ads','Google ad','Google','Live',['of20'],'jw','3 days ago',{short:'Local intent, ten mile radius',specs:'8 headlines, 3 descriptions.'}),
      A('as28','br4','Squad Sponsorship Pack','Document','Owned','Review',['of21'],'jw','2 days ago',{short:'Tiers and reach',ctaId:'ct10',files:[{name:'squad-sponsorship-2026.pdf',size:'5.6 MB'}],notes:'Waiting on final attendance figures before this goes to buyers.'}),
      A('as29','br4','Northgate Logo','Logo','Owned','Approved',[],'jw','1 year ago',{files:[{name:'northgate-logo.svg',size:'34 KB'}]}),
      A('as32',null,'New Client Onboarding','SOP','Owned','Live',[],'pr','2 months ago',{short:'Kickoff to first deliverable',tags:['process','onboarding'],files:[{name:'client-onboarding-sop.pdf',size:'380 KB'}],
        notes:'Covers the kickoff call, access handover, brand set-up in here, and what has to be signed before work starts. NDA and photo release live as attachments on this SOP.'}),
      A('as33',null,'Asset Handover to Client','SOP','Owned','Live',[],'jw','3 months ago',{short:'What we send and how',tags:['process','delivery'],files:[{name:'handover-sop.pdf',size:'240 KB'},{name:'photo-release.pdf',size:'120 KB'}],
        notes:'Nothing leaves without Cleared to send on the asset and a named approver in the review log.'}),
      A('as30',null,'Campaign Launch','SOP','Owned','Live',[],'ta','6 weeks ago',{short:'Go-live sequence',tags:['process','launch'],files:[{name:'launch-sop.pdf',size:'290 KB'}],
        notes:'Order of operations for the day a campaign goes live, including who watches spend for the first 48 hours.'}),
      A('as34',null,'Universal Email Wrapper','Template','Email','Approved',[],'ib','3 months ago',{isTemplate:true,short:'Brand-agnostic email shell',tags:['template','email']}),
      A('as35',null,'Sponsorship Booking Brief','Template','Owned','Approved',[],'do','3 months ago',{isTemplate:true,short:'What to send a newsletter owner',tags:['template','sponsorship']})
    ];
    brands.forEach(b=>{ b.goals=JSON.parse(JSON.stringify(this.DEFAULTGOALS())); });
    const GMAP={an1:'Audience growth',an2:'Revenue',an3:'Audience growth',an4:'Recruitment',an5:'Retention',an6:'Revenue',an7:'Retention',an8:'Recruitment',an9:'Audience growth',an10:'Audience growth',an11:'Retention',an12:'Recruitment'};
    const TMAP={of15:'Audit',of16:'Content series',of17:'Campaign',of18:'Campaign',of19:'Campaign',of20:'Campaign',of21:'Paid engagement'};
    offers.forEach(o=>{ o.goals=(o.angles||[]).map(x=>GMAP[x]).filter(Boolean); delete o.angles; o.offerType=TMAP[o.id]||'Paid engagement'; o.review='None'; o.reviewer=null; o.changeNote=''; });
    offers.push(
      O('of22','br1',null,'Nonprofit Marketing Notes','Weekly, no pitch','All segments',[],'Active','do','yesterday',
        'A weekly note about what actually worked for a nonprofit that week, written in public on LinkedIn and mirrored to the list. Nothing in it is for sale.',
        'Two hundred new subscribers a quarter without a single ad.','Grew from 0 to 1,900 subscribers in fourteen months.','','',['organic','linkedin','content']),
      O('of23','br1','sv1','Ad Grant Readiness Checklist','Gated, doc on request','All segments',[],'Active','do','3 days ago',
        'A one-page checklist that tells a nonprofit whether they are even eligible before they waste a month applying.',
        'Four hundred downloads a quarter, half of them qualified.','Highest-converting thing on LinkedIn. 31 percent request rate.','ct1','',['lead-magnet','linkedin']),
      O('of24','br1','sv1','Thirty-Minute Grant Consultation','Free, no deck','All segments',[],'Active','pr','1 week ago',
        'Half an hour on a call where we answer the actual question instead of presenting credentials.',
        'Eight booked calls a month.','Converts at 34 percent to a paid engagement.','ct1','ct2',['consultation','sales'])
    );
    offers.find(o=>o.id==='of22').goals=['Awareness','Audience growth'];
    offers.find(o=>o.id==='of22').offerType='Content series';
    offers.find(o=>o.id==='of23').goals=['Audience growth'];
    offers.find(o=>o.id==='of23').offerType='Lead magnet';
    offers.find(o=>o.id==='of24').goals=['Revenue'];
    offers.find(o=>o.id==='of24').offerType='Free consultation';
    offers.forEach(o=>{ if(o.review===undefined){ o.review='None'; o.reviewer=null; o.changeNote=''; } });
    assets.push(
      A('as36','br1','LinkedIn Carousel — Grant Myths','LinkedIn post','LinkedIn','Review',['of22','of23'],'do','3 hours ago',{short:'8 slides, no pitch',tags:['linkedin','organic'],specs:'1080x1350, eight slides.',
        copy:{headline:'Five things people believe about the Google Ad Grant that are simply not true',body:'Slide by slide, with the policy reference for each one.',cta:''}}),
      A('as37','br1','LinkedIn Weekly Note Series','LinkedIn post','LinkedIn','Live',['of22'],'do','yesterday',{version:3,short:'52 posts, one a week',tags:['linkedin','organic','evergreen'],
        notes:'Written in public first, mirrored to the newsletter on Fridays. Never carries an ask.'}),
      A('as38','br1','Ad Grant Readiness Checklist','Lead magnet','Owned','Live',['of23','of15'],'do','3 days ago',{version:2,short:'Gated doc, sent on request',clientVisible:true,tags:['lead-magnet','gated'],
        url:'docs.google.com/document/d/grant-readiness',
        copy:{headline:'Are you actually eligible for the Google Ad Grant?',body:'Fourteen checks. If you fail three of them, do not apply yet.',cta:'Request the checklist'},
        notes:'No designed landing page. People request it in a LinkedIn comment or the newsletter and we send the Doc link.'}),
      A('as39','br1','Consultation Booking Page','Landing page','Owned','Changes requested',['of24'],'ib','6 hours ago',{short:'Calendar embed only',url:'quokkaforgood.org/consultation',ctaId:'ct1',tags:['landing','sales']}),
      A('as40','br1','Grant Myths Newsletter Edition','Newsletter ad','Email','Draft',['of22'],'do','2 days ago',{short:'Friday mirror of the carousel',tags:['newsletter','organic']})
    );
    const SMAP={'Draft':['Draft','None'],'Review':['Draft','In review'],'Changes requested':['Draft','Changes requested'],'Approved':['Ready','Approved'],'Live':['Live','Approved'],'Archived':['Archived','None']};
    assets.forEach(a=>{
      const m=SMAP[a.status]||['Draft','None']; a.status=m[0]; a.review=m[1];
      if(a.gated===undefined) a.gated=false;
      if(a.items===undefined&&a.type==='Checklist') a.items=[];
      if(a.prompt===undefined&&a.type==='Prompt') a.prompt='';
      if(a.delivery===undefined) a.delivery=(a.type==='Landing page')?'Designed page':'None';
      if(a.reviewer===undefined) a.reviewer=null;
      if(a.changeNote===undefined) a.changeNote='';
    });
    const setA=(id,p)=>{ const x=assets.find(y=>y.id===id); if(x) Object.assign(x,p); };
    setA('as38',{gated:true,delivery:'Doc link'});
    setA('as39',{delivery:'Designed page',reviewer:'pr',changeNote:'The calendar embed pushes the only proof point below the fold. Move the 34 percent line above it.'});
    setA('as2',{reviewer:'pr'});
    setA('as36',{reviewer:'pr'});
    setA('as21',{reviewer:'jw'});
    setA('as28',{reviewer:'jw'});
    setA('as23',{reviewer:'pr'});
    setA('as29',{reviewer:'ib'});
    const setO=(id,p)=>{ const x=offers.find(y=>y.id===id); if(x) Object.assign(x,p); };
    setO('of12',{review:'In review',reviewer:'pr'});
    setO('of3',{review:'Changes requested',reviewer:'pr',changeNote:'Proof point is empty. Do not put this in front of a club until the March pilot gives us a number.'});
    setO('of24',{review:'Approved',reviewer:'jw'});
    const links=[];
    assets.forEach(a=>{ (a._o||[]).forEach(o=>links.push({id:this.uid('lk'),assetId:a.id,offerId:o,createdAt:'2026-08-12',createdBy:'pr'})); delete a._o; });
    const act=(user,action,type,id,label,field,ago)=>({id:this.uid('ac'),user,action,type,id,label,field:field||'',ago});
    const activity=[
      act('pr','updated','asset','as1','Free Audit Landing Page','Copy','2 hours ago'),
      act('do','sent for review','asset','as2','Meta Ads — Church Giving','Status','5 hours ago'),
      act('pr','updated','offer','of15','Free Marketing Audit','Proof','6 hours ago'),
      act('do','updated','asset','as19','Christmas Appeal Landing Page','Copy','yesterday'),
      act('pr','linked','asset','as3','Google Search Ads — Grant Intent','to Free Marketing Audit','yesterday'),
      act('do','sent for review','asset','as21','Standing Order Explainer','Status','2 days ago'),
      act('jw','sent for review','asset','as28','Squad Sponsorship Pack','Status','2 days ago'),
      act('jw','updated','offer','of20','Spring Intake','Promise','2 days ago'),
      act('do','created','offer','of12','Impact Report for Long-Term Trust','','2 weeks ago'),
      act('jw','created','offer','of3','Ad Grant for Club Sign-ups','','4 days ago'),
      act('ta','paused','offer','of14','Workspace for Schools','Status','1 month ago'),
      act('ib','updated','offer','of7','Campaign Landing Page','Positioning','yesterday')
    ];
    const CL=(id,name,short,tags,items)=>({id,brandId:null,name,type:'Checklist',channel:'Owned',status:'Live',review:'Approved',reviewer:'pr',changeNote:'',
      owner:'pr',ago:'2 weeks ago',version:2,short,tags,url:'',notes:'',copy:null,files:[],specs:'',audienceNotes:'',aiPrompt:'',ctaId:null,
      clientVisible:false,isTemplate:false,clonedFrom:null,gated:false,delivery:'None',archived:false,
      items:items.map(t=>({text:t,done:false}))});
    const PR=(id,name,short,promptFor,tags,prompt)=>({id,brandId:null,name,type:'Prompt',channel:'Owned',status:'Live',review:'Approved',reviewer:'pr',changeNote:'',
      owner:'do',ago:'1 week ago',version:3,short,tags,url:'',notes:'',copy:null,files:[],specs:'',audienceNotes:'',aiPrompt:'',ctaId:null,
      clientVisible:false,isTemplate:false,clonedFrom:null,gated:false,delivery:'None',archived:false,
      promptFor,prompt});
    assets.push(
      CL('ck1','Google Ad Grant Approval','Before you submit the application',['grant','compliance'],[
        'Nonprofit status verified and current in the Google for Nonprofits account',
        'Website is on a verified domain the organisation actually owns',
        'HTTPS on every page the ads point at, no mixed content',
        'No broken links anywhere in the site navigation',
        'At least two ad groups per campaign, two ads per ad group',
        'Sitelink extensions on every campaign',
        'Geographic targeting set and not left at worldwide',
        'Conversion tracking live and firing before submission',
        'No single-word or overly generic keywords',
        'Landing pages match ad copy, no bait and switch',
        'Donation page reachable within two clicks from every landing page',
        'Account linked to Analytics with data flowing'
      ]),
      CL('ck2','Website Optimization','Run quarterly on any live site',['web','recurring'],[
        'Every page has a unique title under sixty characters',
        'Meta descriptions written, not auto-generated',
        'One H1 per page, headings in real order',
        'All images have alt text that describes the image',
        'Internal links point at live pages, no redirect chains',
        'Primary CTA above the fold on every landing page',
        'Forms tested on a real phone, not just a resized browser',
        'Analytics and conversion goals verified this quarter',
        '404 page exists and offers a way back',
        'Sitemap current and submitted'
      ]),
      CL('ck3','Speed Optimization','When a site feels slow',['web','performance'],[
        'Largest Contentful Paint under 2.5 seconds on mobile',
        'Cumulative Layout Shift under 0.1',
        'Images served as WebP or AVIF at display size',
        'Hero image preloaded, everything below the fold lazy-loaded',
        'Fonts subset and preloaded, no render-blocking webfont',
        'Unused CSS and JS removed, not just minified',
        'Caching headers set on static assets',
        'Third-party scripts audited — every one justified',
        'Server response under 600ms',
        'Tested on a throttled 4G connection, not office wifi'
      ]),
      CL('ck4','Website Audit','Full review before a rebuild pitch',['web','audit'],[
        'Crawl complete, every page inventoried',
        'Traffic by page pulled for the last twelve months',
        'Conversion paths mapped end to end',
        'Mobile experience reviewed on a real device',
        'Accessibility pass — contrast, focus order, keyboard nav',
        'Content freshness checked, stale pages flagged',
        'Brand consistency against the current guidelines',
        'Competitor comparison on the three pages that matter',
        'Technical SEO issues listed and prioritised',
        'Findings written up with an owner against each fix'
      ]),
      CL('ck5','Landing Page Audit','Before a page goes live',['web','landing','audit'],[
        'One page, one goal, one primary CTA',
        'Headline names the reader\u2019s problem, not our service',
        'Proof point visible without scrolling',
        'Form asks for the minimum that makes the lead useful',
        'CTA text matches the CTA library entry',
        'Thank-you state tested, not assumed',
        'Tracking fires on submit and is visible in Analytics',
        'Page loads under three seconds on mobile',
        'Copy read aloud once — no sentence longer than a breath',
        'Client-facing claim checked against what legal allows'
      ]),
      PR('pm1','Landing Page Hero Copy','Headline, subhead and CTA','Copy',['landing','copy'],
        'You write landing page headlines for nonprofit organisations.\n\nContext:\n- Organisation: [NAME]\n- What they do: [ONE SENTENCE]\n- The offer: [OFFER POSITIONING]\n- Segment: [church / education / sports nonprofit]\n- Goal: [awareness / audience growth / revenue / retention / recruitment]\n\nWrite three options. Each needs:\n1. A headline under fourteen words that names the reader\u2019s problem, not our service\n2. A subhead of one sentence that says what happens next\n3. CTA text of three words or fewer\n\nRules: no \u201cmake a difference\u201d, no \u201cempower\u201d, no \u201cunlock\u201d. Use a specific number wherever one exists. Write at reading age eleven.'),
      PR('pm2','Meta Ad Creative Brief','Static image ad set','Creative',['meta','ads'],
        'Generate creative direction for a Meta ad set.\n\nContext:\n- Brand: [NAME] \u2014 primary colour [HEX], secondary [HEX]\n- Offer: [OFFER NAME AND POSITIONING]\n- Audience: [WHO, AND WHAT THEY ALREADY BELIEVE]\n- Proof we can use: [NUMBER OR RESULT]\n\nProduce four variants. For each:\n- Visual direction in one sentence (subject, composition, mood)\n- Primary text, maximum 125 characters\n- Headline, maximum 40 characters\n- Which single objection it answers\n\nSizes: 1080x1080 and 1080x1350. No stock-photo handshakes, no people pointing at laptops.'),
      PR('pm3','Impact Report Section Draft','One section, three editions','Copy',['report','copy'],
        'Draft one section of a nonprofit impact report.\n\nContext:\n- Section: [NAME]\n- The numbers: [DATA]\n- Edition: [donor / subscriber / funder]\n\nEdition rules:\n- Donor edition ends with an ask and names what the next gift buys\n- Subscriber edition has no ask at all\n- Funder edition leads with method and states the limitations honestly\n\nLength: 180 to 250 words. Lead with the number, then the person it describes. One quote maximum. Never use the word \u201cjourney\u201d.'),
      PR('pm4','LinkedIn Carousel Outline','Eight slides, no pitch','Creative',['linkedin','organic'],
        'Outline a LinkedIn carousel for a nonprofit marketing audience.\n\nContext:\n- Topic: [TOPIC]\n- The one thing the reader should do differently afterwards: [CHANGE]\n- Proof or example available: [DETAIL]\n\nEight slides:\n1. A claim most of the audience believes and is wrong about\n2-6. One idea per slide, one sentence plus one supporting line\n7. The specific action\n8. Who wrote it, no logo wall\n\nNo pitch anywhere. No \u201cswipe \u2192\u201d. Slide one must work as a standalone image in the feed.')
    );
    const mkComments=()=>[
      {id:'cm1',kind:'asset',itemId:'as1',user:'jw',text:'Client asked whether we can say “ten thousand” or have to say “up to ten thousand”. Legal says up to. Can we reword without losing the punch?',ago:'4 hours ago',resolved:false,isChange:false},
      {id:'cm2',kind:'asset',itemId:'as1',user:'pr',text:'“Worth up to ten thousand a month. Most of it goes unspent.” Same punch, defensible.',ago:'3 hours ago',resolved:false,isChange:false},
      {id:'cm3',kind:'asset',itemId:'as39',user:'pr',text:'The calendar embed pushes the only proof point below the fold. Move the 34 percent line above it.',ago:'6 hours ago',resolved:false,isChange:true},
      {id:'cm4',kind:'asset',itemId:'as36',user:'ib',text:'Slide four has the old logo lockup. Everything else is current.',ago:'2 hours ago',resolved:false,isChange:false},
      {id:'cm5',kind:'offer',itemId:'of3',user:'pr',text:'Proof point is empty. Do not put this in front of a club until the March pilot gives us a number.',ago:'4 days ago',resolved:false,isChange:true},
      {id:'cm6',kind:'offer',itemId:'of12',user:'do',text:'Two trust funders have seen the draft structure and both asked for the method note up front rather than as an appendix.',ago:'1 week ago',resolved:false,isChange:false},
      {id:'cm7',kind:'asset',itemId:'as38',user:'do',text:'Worth building a real page for this eventually — the Doc link converts fine but we lose everyone who wants to skim before requesting.',ago:'3 days ago',resolved:true,isChange:false},
      {id:'cm8',kind:'offer',itemId:'of7',user:'ib',text:'This page structure is now carrying four offers. If we change it, check all four before shipping.',ago:'yesterday',resolved:false,isChange:false},
      {id:'cm9',kind:'asset',itemId:'as1',user:'do',text:'@Priya Raman the same proof line is doing work on #Ad Grant for Church Reach — if we reword it here we should reword it there the same day.',ago:'2 hours ago',resolved:false,isChange:false,refs:['of1'],mentions:['pr']},
      {id:'cm10',kind:'offer',itemId:'of15',user:'jw',text:'Worth saying out loud: #Ad Grant for Church Giving is the one that actually converts off this audit, not the reach version. @Dana Okafor can you check the sequence points there?',ago:'yesterday',resolved:false,isChange:false,refs:['of4'],mentions:['do']},
      {id:'cm11',kind:'offer',itemId:'of22',user:'do',text:'The checklist we gate on #Ad Grant Readiness Checklist is the single best performing thing in the feed. Keep it in the rotation.',ago:'3 days ago',resolved:false,isChange:false,refs:['of23'],mentions:[]}
    ];
    const comments=mkComments().map(c=>Object.assign({refs:[],mentions:[]},c));
    [['offer','of14'],['offer','of5'],['asset','as7'],['asset','as22'],['service','sv4']].forEach(p=>{
      const arr=p[0]==='offer'?offers:(p[0]==='asset'?assets:services);
      const x=arr.find(y=>y.id===p[1]); if(x) x.archived=true;
    });
    return {users,clients,brands,services,offers,assets,ctas,links,activity,comments,groups,me:'pr',recents:[{k:'brand',id:'br1'},{k:'service',id:'sv1'},{k:'offer',id:'of15'},{k:'asset',id:'as1'}]};
  }

  /* ---------------- lifecycle ---------------- */
  componentDidMount(){ window.addEventListener('keydown',this.onKey); this.applyTheme(); }
  componentWillUnmount(){ window.removeEventListener('keydown',this.onKey); }
  componentDidUpdate(){ this.applyTheme(); }
  onKey(e){
    if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){ e.preventDefault(); this.setState(s=>({cmdk:!s.cmdk,q:''})); return; }
    if(e.key==='/'&&!/^(INPUT|TEXTAREA|SELECT)$/.test((e.target&&e.target.tagName)||'')){ e.preventDefault(); this.setState({cmdk:true,q:''}); return; }
    if(e.key==='Escape'){ this.setState({cmdk:false,modal:null,drawer:null,inbox:false,whoOpen:false}); }
  }
  applyTheme(){
    const mode=this.props.brandTakeover??'bold';
    const b=this.activeBrand(); const r=document.documentElement;
    if(b&&mode!=='off'){
      r.style.setProperty('--bos-accent',b.primary);
      r.style.setProperty('--bos-accent2',b.secondary);
      r.style.setProperty('--bos-on',this.onColor(b.primary));
      r.style.setProperty('--bos-soft',this.hexA(b.primary,0.09));
      if(mode==='bold'){
        r.style.setProperty('--bos-tint',this.hexA(b.primary,0.045));
        r.style.setProperty('--bos-border',this.hexA(b.secondary,0.30));
      } else { r.style.setProperty('--bos-tint','#F7F9F8'); r.style.setProperty('--bos-border','#E1E7E4'); }
    } else {
      const g=this.props.globalAccent||'#2D4A5C';
      r.style.setProperty('--bos-accent',g);
      r.style.setProperty('--bos-accent2','#7BA0A8');
      r.style.setProperty('--bos-on',this.onColor(g));
      r.style.setProperty('--bos-soft','#EDF2F0');
      r.style.setProperty('--bos-tint','#F7F9F8');
      r.style.setProperty('--bos-border','#E1E7E4');
    }
  }

  /* ---------------- lookups ---------------- */
  get db(){ return this.state.db; }
  brand(id){ return this.db.brands.find(b=>b.id===id)||null; }
  client(id){ return this.db.clients.find(c=>c.id===id)||null; }
  offer(id){ return this.db.offers.find(o=>o.id===id)||null; }
  asset(id){ return this.db.assets.find(a=>a.id===id)||null; }
  cta(id){ return this.db.ctas.find(c=>c.id===id)||null; }
  user(id){ return this.db.users.find(u=>u.id===id)||{name:'Unassigned',initials:'—'}; }
  offersOf(bid){ return this.db.offers.filter(o=>o.brandId===bid); }
  assetsOf(bid){ return this.db.assets.filter(a=>a.brandId===bid); }
  campaignAssetsOf(bid){ return this.assetsOf(bid).filter(a=>this.catOf(a)==='campaign'); }
  catOf(a){ const t=this.TYPES()[a.type]; return a.isTemplate?'global':(t?t.cat:'campaign'); }
  codeOf(a){ const t=this.TYPES()[a.type]; return t?t.code:'AST'; }
  linkedAssetIds(oid){ return this.db.links.filter(l=>l.offerId===oid).map(l=>l.assetId); }
  linkedAssets(oid){ const ids=this.linkedAssetIds(oid); return this.db.assets.filter(a=>ids.indexOf(a.id)>=0); }
  linkedOffers(aid){ const ids=this.db.links.filter(l=>l.assetId===aid).map(l=>l.offerId); return this.db.offers.filter(o=>ids.indexOf(o.id)>=0); }
  subBrands(bid){ return this.db.brands.filter(b=>b.parentId===bid); }
  service(id){ return (this.db.services||[]).find(s=>s.id===id)||null; }
  servicesOf(bid){ return (this.db.services||[]).filter(s=>s.brandId===bid); }
  offersOfService(sid){ return this.db.offers.filter(o=>o.serviceId===sid); }
  standaloneOffers(bid){ return this.db.offers.filter(o=>o.brandId===bid&&!o.serviceId); }
  meId(){ return this.db.me||'pr'; }
  goalChips(o){ return (o.goals||[]).map(n=>{ const c=this.goalColor(o.brandId,n); return {name:n,bg:this.hexA(c,0.13),fg:c}; }); }
  waitOn(kind,x){
    if(!x) return null;
    if(x.review==='In review') return {who:x.reviewer,verb:'Review',act:'review'};
    if(x.review==='Changes requested') return {who:x.owner,verb:'Make changes',act:'change'};
    return null;
  }
  commentsOf(kind,id){ return (this.db.comments||[]).filter(c=>c.kind===kind&&c.itemId===id); }
  openCount(kind,id){ return this.commentsOf(kind,id).filter(c=>!c.resolved).length; }
  tokenAt(t){
    const m=/([#@])([^#@\n]*)$/.exec(t||'');
    if(!m) return null;
    return {sign:m[1],q:(m[2]||'').toLowerCase(),start:m.index};
  }
  suggestions(){
    const tk=this.tokenAt(this.state.cmtText);
    if(!tk) return null;
    const rows=[];
    if(tk.sign==='#'){
      this.db.offers.filter(o=>!o.archived&&this.seesBrand(o.brandId)).forEach(o=>{
        if(tk.q&&o.name.toLowerCase().indexOf(tk.q)<0) return;
        const b=this.brand(o.brandId)||{};
        rows.push({id:o.id,label:o.name,sub:b.name+' · '+(o.serviceId?((this.service(o.serviceId)||{}).name||''):'Standalone'),sign:'#'});
      });
    } else {
      this.db.users.forEach(u=>{
        if(tk.q&&u.name.toLowerCase().indexOf(tk.q)<0) return;
        rows.push({id:u.id,label:u.name,sub:u.role,sign:'@'});
      });
    }
    return {tk,rows:rows.slice(0,5)};
  }
  pickToken(row,tk){
    const t=this.state.cmtText||'';
    const next=t.slice(0,tk.start)+tk.sign+row.label+' ';
    this.setState(s=>({
      cmtText:next,
      cmtRefs:row.sign==='#'?(s.cmtRefs||[]).concat([row.id]):(s.cmtRefs||[]),
      cmtMentions:row.sign==='@'?(s.cmtMentions||[]).concat([row.id]):(s.cmtMentions||[])
    }));
  }
  segments(c){
    const marks=[];
    (c.refs||[]).forEach(id=>{ const o=this.offer(id); if(o) marks.push({find:'#'+o.name,label:'#'+o.name,go:()=>this.go('offer',id),kind:'ref'}); });
    (c.mentions||[]).forEach(id=>{ const u=this.user(id); if(u&&u.name) marks.push({find:'@'+u.name,label:'@'+u.name,go:null,kind:'at'}); });
    marks.sort((a,b)=>b.find.length-a.find.length);
    let parts=[{text:c.text||'',chip:false}];
    marks.forEach(m=>{
      const out=[];
      parts.forEach(p=>{
        if(p.chip){ out.push(p); return; }
        const bits=p.text.split(m.find);
        bits.forEach((bit,i)=>{
          if(bit) out.push({text:bit,chip:false});
          if(i<bits.length-1) out.push({text:m.label,chip:true,kind:m.kind,go:m.go});
        });
      });
      parts=out;
    });
    return parts.map((p,i)=>({
      id:i,text:p.text,chip:!!p.chip,plain:!p.chip,
      bg:p.kind==='ref'?'var(--bos-soft)':'#EDF2F0',
      fg:p.kind==='ref'?'var(--bos-accent)':'#3E4A45',
      cur:p.go?'pointer':'default',
      click:p.go||(()=>{})
    }));
  }
  mentionsOf(kind,id){
    return (this.db.comments||[]).filter(c=>{
      if(c.resolved) return false;
      if(c.kind===kind&&c.itemId===id) return false;
      return (c.refs||[]).indexOf(id)>=0;
    });
  }
  postComment(kind,id){
    if(!this.can('comment')) return;
    const t=(this.state.cmtText||'').trim(); if(!t) return;
    this.commit(db=>{
      if(!db.comments) db.comments=[];
      db.comments.push({id:this.uid('cm'),kind,itemId:id,user:this.meId(),text:t,ago:'just now',resolved:false,isChange:false,
        refs:(this.state.cmtRefs||[]).filter(r=>t.indexOf('#'+((this.offer(r)||{}).name||'\u0000'))>=0),
        mentions:(this.state.cmtMentions||[]).filter(r=>t.indexOf('@'+((this.user(r)||{}).name||'\u0000'))>=0)});
    },'comment');
    this.setState({cmtText:'',cmtRefs:[],cmtMentions:[]});
  }
  thread(kind,id){
    const list=this.commentsOf(kind,id);
    return list.map(c=>{
      const u=this.user(c.user);
      return {id:c.id,initials:u.initials,who:u.name.split(' ')[0],role:u.role,text:c.text,segs:this.segments(c),ago:c.ago,
        isChange:c.isChange,resolved:c.resolved,
        bg:c.resolved?'#FAFBFB':(c.isChange?'rgba(194,65,18,.06)':'#FFFFFF'),
        bd:c.resolved?'var(--bos-border)':(c.isChange?'rgba(194,65,18,.28)':'var(--bos-border)'),
        tagLabel:c.isChange?'Change request':'',
        opacity:c.resolved?'.6':'1',
        resolveLabel:c.resolved?'Reopen':'Resolve',
        resolve:()=>this.toggleResolve(c.id)};
    });
  }
  items(a){ return (a&&a.items)||[]; }
  doneCount(a){ return this.items(a).filter(i=>i.done).length; }
  toggleItem(aid,idx){
    this.commit(db=>{ const x=db.assets.find(y=>y.id===aid); if(x&&x.items&&x.items[idx]) x.items[idx].done=!x.items[idx].done; },'comment');
  }
  resetList(aid){ this.commit(db=>{ const x=db.assets.find(y=>y.id===aid); if(x&&x.items) x.items.forEach(i=>{i.done=false;}); },'comment'); }
  addItem(aid){
    const t=(this.state.itemText||'').trim(); if(!t) return;
    this.commit(db=>{ const x=db.assets.find(y=>y.id===aid); if(x){ x.items=x.items||[]; x.items.push({text:t,done:false}); } });
    this.setState({itemText:''});
  }
  removeItem(aid,idx){ this.commit(db=>{ const x=db.assets.find(y=>y.id===aid); if(x&&x.items) x.items.splice(idx,1); }); }
  copyText(t,key){
    try{ navigator.clipboard.writeText(t||''); }catch(e){}
    this.setState(s=>({dl:Object.assign({},s.dl,{[key]:'Copied'})}));
    setTimeout(()=>this.setState(s=>{const d=Object.assign({},s.dl); delete d[key]; return {dl:d};}),1600);
  }
  markDl(k){ this.setState(s=>({dl:Object.assign({},s.dl,{[k]:'Downloaded'})})); setTimeout(()=>this.setState(s=>{const d=Object.assign({},s.dl); delete d[k]; return {dl:d};}),1800); }
  toggleResolve(cid){
    if(!this.can('comment')) return; this.commit(db=>{ const c=(db.comments||[]).find(x=>x.id===cid); if(c) c.resolved=!c.resolved; },'comment'); }
  bar(list){
    return list.slice(0,28).map(a=>{
      const rv=a.review||'None';
      const c=rv==='Approved'?'#2F8F62':(rv==='In review'?'#C99A2E':(rv==='Changes requested'?'#C2410C':'#CBD6D1'));
      return {id:a.id,color:c,title:a.name+' — '+(a.status||'Draft')+(rv!=='None'?(' · '+rv):''),
        ring:a.status==='Live'?'inset 0 0 0 1.5px rgba(16,22,20,.35)':'none',
        click:()=>this.openAsset(a.id)};
    });
  }
  visibleTo(kind,x,uid){
    if(!x||x.archived) return false;
    if(kind==='asset') return !x.brandId||this.seesBrand(x.brandId,uid);
    return this.seesBrand(x.brandId,uid);
  }
  queue(uid){
    const out=[];
    this.db.assets.filter(a=>this.visibleTo('asset',a,uid)).forEach(a=>{ const w=this.waitOn('asset',a); if(w&&w.who) out.push({kind:'asset',id:a.id,name:a.name,sub:(a.brandId?(this.brand(a.brandId)||{}).name:'Global Library')+' · '+a.type,who:w.who,verb:w.verb,act:w.act,note:a.changeNote,ago:a.ago}); });
    this.db.offers.filter(o=>this.visibleTo('offer',o,uid)).forEach(o=>{ const w=this.waitOn('offer',o); if(w&&w.who) out.push({kind:'offer',id:o.id,name:o.name,sub:(this.brand(o.brandId)||{}).name+' · Offer',who:w.who,verb:w.verb,act:w.act,note:o.changeNote,ago:o.ago}); });
    return out;
  }
  sendForReview(kind,id,who){
    if(!this.can('review')) return;
    this.commit(db=>{
      const arr=kind==='asset'?db.assets:db.offers; const i=arr.findIndex(x=>x.id===id);
      if(i<0) return;
      arr[i].review='In review';
      arr[i].reviewer=who; arr[i].changeNote=''; arr[i].ago='just now';
      this.logAct(db,'asked '+(this.user(who).name.split(' ')[0])+' to review',kind,id,arr[i].name,'');
    },'review');
    this.setState({modal:null,draft:{}});
  }
  approveItem(kind,id){
    if(!this.can('review')) return;
    this.commit(db=>{
      const arr=kind==='asset'?db.assets:db.offers; const i=arr.findIndex(x=>x.id===id);
      if(i<0) return;
      arr[i].review='Approved';
      if(kind==='asset'&&arr[i].status==='Draft') arr[i].status='Ready';
      arr[i].changeNote=''; arr[i].ago='just now';
      this.logAct(db,'approved',kind,id,arr[i].name,'');
    },'review');
  }
  requestChanges(){
    if(!this.can('review')) return;
    const d=this.state.draft;
    this.commit(db=>{
      const arr=d.kind==='asset'?db.assets:db.offers; const i=arr.findIndex(x=>x.id===d.id);
      if(i<0) return;
      arr[i].review='Changes requested';
      arr[i].changeNote=d.note||''; arr[i].ago='just now';
      if(!db.comments) db.comments=[];
      db.comments.push({id:this.uid('cm'),kind:d.kind,itemId:d.id,user:this.meId(),text:d.note||'',ago:'just now',resolved:false,isChange:true});
      this.logAct(db,'requested changes on',d.kind,d.id,arr[i].name,d.note||'');
    },'review');
    this.setState({modal:null,draft:{}});
  }
  setMe(id){ this.commit(db=>{ db.me=id; },null); this.setState({whoOpen:false}); }
  assetsOfService(sid){ const oids=this.offersOfService(sid).map(o=>o.id); const seen={}; this.db.links.forEach(l=>{ if(oids.indexOf(l.offerId)>=0) seen[l.assetId]=1; }); return Object.keys(seen); }
  activeBrand(){
    const s=this.state;
    if(s.drawer){ const a=this.asset(s.drawer); if(a&&a.brandId) return this.brand(a.brandId); }
    if(s.view==='brand') return this.brand(s.vid);
    if(s.view==='offer'){ const o=this.offer(s.vid); return o?this.brand(o.brandId):null; }
    if(s.view==='service'){ const v=this.service(s.vid); return v?this.brand(v.brandId):null; }
    return null;
  }

  /* ---------------- navigation ---------------- */
  pushRecent(k,id){ this.commit(db=>{ db.recents=(db.recents||[]).filter(r=>!(r.k===k&&r.id===id)); db.recents.unshift({k,id}); if(db.recents.length>4) db.recents.length=4; },null); }
  allowed(view,vid){
    if(view==='client') return this.seesClient(vid);
    if(view==='brand') return this.seesBrand(vid);
    if(view==='offer'){ const o=this.offer(vid); return !o||this.seesBrand(o.brandId); }
    if(view==='service'){ const v=this.service(vid); return !v||this.seesBrand(v.brandId); }
    return true;
  }
  go(view,vid,tab){ if(!this.allowed(view,vid)){ this.setState({view:'street',vid:null,cmdk:false,modal:null,drawer:null}); return; } this.setState({view,vid,brandTab:tab||'home',cmdk:false,modal:null,nudge:null,drawer:null,inbox:false,whoOpen:false}); if(view==='brand'||view==='offer'||view==='service') this.pushRecent(view,vid); window.scrollTo(0,0); }
  openAsset(id){ const a=this.asset(id); if(a&&a.brandId&&!this.seesBrand(a.brandId)) return; this.setState({drawer:id,drawerTab:'overview',cmdk:false,modal:null,inbox:false,whoOpen:false}); this.pushRecent('asset',id); }

  /* ---------------- mutations ---------------- */
  toggleLink(assetId,offerId,nudge){
    if(!this.can('edit')) return;
    const has=this.db.links.some(l=>l.assetId===assetId&&l.offerId===offerId);
    const a=this.asset(assetId), o=this.offer(offerId);
    this.commit(db=>{
      if(has){ db.links=db.links.filter(l=>!(l.assetId===assetId&&l.offerId===offerId)); this.logAct(db,'unlinked','asset',assetId,a?a.name:'',('from '+(o?o.name:''))); }
      else { db.links.push({id:this.uid('lk'),assetId,offerId,createdAt:'today',createdBy:'pr'}); this.logAct(db,'linked','asset',assetId,a?a.name:'',('to '+(o?o.name:''))); }
    });
    if(!has&&nudge) this.setState({nudge:{assetId,offerId}});
  }
  saveOffer(){
    if(!this.can('edit')) return;
    const d=this.state.draft; if(!d.name||!d.name.trim()) return;
    const isNew=!d.id;
    this.commit(db=>{
      if(isNew){ const o=Object.assign({},d,{id:this.uid('of'),ago:'just now',tags:d.tags||[]}); db.offers.push(o); this.logAct(db,'created','offer',o.id,o.name,''); d.id=o.id; }
      else { const i=db.offers.findIndex(o=>o.id===d.id); if(i>=0){ db.offers[i]=Object.assign({},db.offers[i],d,{ago:'just now'}); this.logAct(db,'updated','offer',d.id,d.name,'Details'); } }
    });
    const id=this.state.draft.id;
    this.setState({modal:null,draft:{}});
    if(isNew&&id) setTimeout(()=>this.go('offer',id),0);
  }
  saveAsset(){
    if(!this.can('edit')) return;
    const d=this.state.draft; if(!d.name||!d.name.trim()) return;
    const isNew=!d.id; const offs=d._offers||[]; let newId=d.id;
    this.commit(db=>{
      if(isNew){
        newId=this.uid('as');
        const a=Object.assign({id:newId,version:1,tags:[],files:[],copy:null,notes:'',url:'',specs:'',audienceNotes:'',aiPrompt:'',clientVisible:false,isTemplate:false,clonedFrom:null,gated:false,delivery:'None',review:'None',reviewer:null,changeNote:'',owner:this.meId(),ago:'just now'},d,{id:newId});
        delete a._offers; db.assets.push(a);
        offs.forEach(oid=>db.links.push({id:this.uid('lk'),assetId:newId,offerId:oid,createdAt:'today',createdBy:'pr'}));
        this.logAct(db,'created','asset',newId,a.name,'');
      } else {
        const i=db.assets.findIndex(a=>a.id===d.id);
        if(i>=0){ const merged=Object.assign({},db.assets[i],d,{ago:'just now',version:(db.assets[i].version||1)+1}); delete merged._offers; db.assets[i]=merged;
          db.links=db.links.filter(l=>l.assetId!==d.id);
          offs.forEach(oid=>db.links.push({id:this.uid('lk'),assetId:d.id,offerId:oid,createdAt:'today',createdBy:'pr'}));
          this.logAct(db,'updated','asset',d.id,merged.name,'Details');
        }
      }
    });
    this.setState({modal:null,draft:{},step:0});
    if(isNew) setTimeout(()=>this.openAsset(newId),0);
  }
  cloneAsset(){
    if(!this.can('edit')) return;
    const d=this.state.draft; const src=this.asset(d.srcId); if(!src) return; let newId=null;
    this.commit(db=>{
      newId=this.uid('as');
      const c=Object.assign({},JSON.parse(JSON.stringify(src)),{
        id:newId,name:d.name||(src.name+' (copy)'),brandId:d.brandId||src.brandId,
        clonedFrom:src.id,status:'Draft',version:1,ago:'just now',
        files:d.keepFiles===false?[]:src.files,copy:d.keepCopy===false?null:src.copy
      });
      db.assets.push(c);
      (d._offers||[]).forEach(oid=>db.links.push({id:this.uid('lk'),assetId:newId,offerId:oid,createdAt:'today',createdBy:'pr'}));
      this.logAct(db,'cloned','asset',newId,c.name,('from '+src.name));
    });
    this.setState({modal:null,draft:{},nudge:null});
    if(newId) setTimeout(()=>this.openAsset(newId),0);
  }
  saveCta(){
    if(!this.can('edit')) return;
    const d=this.state.draft; if(!d.text||!d.text.trim()) return;
    this.commit(db=>{
      if(d.id){ const i=db.ctas.findIndex(c=>c.id===d.id); if(i>=0){ db.ctas[i]=Object.assign({},db.ctas[i],d); this.logAct(db,'updated','cta',d.id,d.text,''); } }
      else { const c=Object.assign({},d,{id:this.uid('ct')}); db.ctas.push(c); this.logAct(db,'created','cta',c.id,c.text,''); }
    });
    this.setState({modal:null,draft:{}});
  }
  saveService(){
    if(!this.can('edit')) return;
    const d=this.state.draft; if(!d.name||!d.name.trim()) return; let id=d.id;
    this.commit(db=>{
      if(!db.services) db.services=[];
      if(d.id){ const i=db.services.findIndex(x=>x.id===d.id); if(i>=0){ db.services[i]=Object.assign({},db.services[i],d,{ago:'just now'}); this.logAct(db,'updated','service',d.id,d.name,'Details'); } }
      else { id=this.uid('sv'); db.services.push(Object.assign({owner:'pr',ago:'just now',short:'',description:''},d,{id})); this.logAct(db,'created','service',id,d.name,''); }
    });
    this.setState({modal:null,draft:{}});
    if(!d.id&&id) setTimeout(()=>this.go('service',id),0);
  }
  saveAngle(){
    const d=this.state.draft; if(!d.name||!d.name.trim()) return;
    this.commit(db=>{
      if(!db.angles) db.angles=[];
      if(d.id){ const i=db.angles.findIndex(x=>x.id===d.id); if(i>=0){ db.angles[i]=Object.assign({},db.angles[i],d); this.logAct(db,'updated','angle',d.id,d.name,''); } }
      else { const id2=this.uid('an'); db.angles.push(Object.assign({description:''},d,{id:id2})); this.logAct(db,'created','angle',id2,d.name,''); }
    });
    this.setState({modal:null,draft:{}});
  }
  toggleDraftGoal(g){ this.setState(s=>{ const cur=(s.draft.goals||[]).slice(); const i=cur.indexOf(g); if(i>=0) cur.splice(i,1); else cur.push(g); return {draft:Object.assign({},s.draft,{goals:cur})}; }); }
  saveGoal(){
    if(!this.can('edit')) return;
    const d=this.state.draft; const nm=(d.name||'').trim(); if(!nm) return;
    this.commit(db=>{
      const i=db.brands.findIndex(x=>x.id===d.brandId); if(i<0) return;
      const gs=db.brands[i].goals||(db.brands[i].goals=[]);
      if(d.original){
        const j=gs.findIndex(g=>g.name===d.original); if(j<0) return;
        gs[j].name=nm; gs[j].description=d.description||'';
        if(d.original!==nm) db.offers.forEach(o=>{ if(o.brandId===d.brandId) o.goals=(o.goals||[]).map(x=>x===d.original?nm:x); });
        this.logAct(db,'renamed goal',"brand",d.brandId,nm,d.original+' → '+nm);
      } else {
        if(gs.some(g=>g.name===nm)) return;
        gs.push({name:nm,description:d.description||''});
        this.logAct(db,'added goal',"brand",d.brandId,nm,'');
      }
    });
    this.setState({modal:null,draft:{}});
  }
  mergeGoal(){
    if(!this.can('edit')) return;
    const d=this.state.draft; if(!d.into||d.into===d.from) return;
    this.commit(db=>{
      const i=db.brands.findIndex(x=>x.id===d.brandId); if(i<0) return;
      db.brands[i].goals=(db.brands[i].goals||[]).filter(g=>g.name!==d.from);
      db.offers.forEach(o=>{
        if(o.brandId!==d.brandId) return;
        const g=(o.goals||[]).map(x=>x===d.from?d.into:x);
        o.goals=g.filter((x,k)=>g.indexOf(x)===k);
      });
      this.logAct(db,'merged goal',"brand",d.brandId,d.into,d.from+' → '+d.into);
    });
    this.setState({modal:null,draft:{}});
  }
  deleteGoal(bid,name){
    if(!this.can('edit')) return;
    this.commit(db=>{
      const i=db.brands.findIndex(x=>x.id===bid); if(i<0) return;
      db.brands[i].goals=(db.brands[i].goals||[]).filter(g=>g.name!==name);
      db.offers.forEach(o=>{ if(o.brandId===bid) o.goals=(o.goals||[]).filter(x=>x!==name); });
      this.logAct(db,'removed goal',"brand",bid,name,'');
    });
    this.setState({modal:null,draft:{}});
  }
  savePerson(){
    if(!this.can('access')) return;
    const d=this.state.draft; const nm=(d.name||'').trim(); if(!nm) return;
    this.commit(db=>{
      if(d.id){ const i=db.users.findIndex(u=>u.id===d.id); if(i>=0) db.users[i]=Object.assign({},db.users[i],d); }
      else {
        const parts=nm.split(/\s+/);
        const ini=((parts[0]||'?')[0]+((parts[1]||'')[0]||'')).toUpperCase();
        db.users.push(Object.assign({role:'Team member'},d,{id:this.uid('u'),initials:ini}));
        this.logAct(db,'invited','person',nm,nm,d.access||'Editor');
      }
    },'access');
    this.setState({modal:null,draft:{}});
  }
  toggleIn(key,val){ this.setState(s=>{ const cur=(s.draft[key]||[]).slice(); const i=cur.indexOf(val); if(i>=0) cur.splice(i,1); else cur.push(val); return {draft:Object.assign({},s.draft,{[key]:cur,all:false})}; }); }
  saveClient(){
    if(!this.can('edit')) return;
    const d=this.state.draft; if(!d.name||!d.name.trim()) return;
    let id=d.id;
    this.commit(db=>{
      if(d.id){ const i=db.clients.findIndex(c=>c.id===d.id); if(i>=0) db.clients[i]=Object.assign({},db.clients[i],d); }
      else { id=this.uid('cl'); db.clients.push(Object.assign({contact:'pr',since:'2026',note:''},d,{id})); this.logAct(db,'created','client',id,d.name,''); }
    });
    this.setState({modal:null,draft:{}});
    if(!d.id&&id) setTimeout(()=>this.go('client',id),0);
  }
  saveBrand(){
    if(!this.can('edit')) return;
    const d=this.state.draft; if(!d.name||!d.name.trim()) return;
    let id=d.id;
    this.commit(db=>{
      if(d.id){ const i=db.brands.findIndex(b=>b.id===d.id); if(i>=0){ db.brands[i]=Object.assign({},db.brands[i],d); this.logAct(db,'updated','brand',d.id,d.name,'Identity'); } }
      else {
        id=this.uid('br');
        db.brands.push(Object.assign({parentId:null,owner:'pr',team:1,description:'',voice:'',boilerplate:'',fonts:[],colours:[],guidelines:[],goals:JSON.parse(JSON.stringify(this.DEFAULTGOALS())),segments:[{name:'All segments',color:'#6E7C76'}],
          mark:(d.name||'?').trim().slice(0,2).toUpperCase(),primary:'#2D4A5C',secondary:'#7BA0A8'},d,{id}));
        this.logAct(db,'created','brand',id,d.name,'');
      }
    });
    this.setState({modal:null,draft:{}});
    if(!d.id&&id) setTimeout(()=>this.go('brand',id,'home'),0);
  }
  doDelete(){
    if(!this.can('del')) return;
    const d=this.state.draft;
    this.commit(db=>{
      if(d.kind==='offer'){ db.offers=db.offers.filter(o=>o.id!==d.id); db.links=db.links.filter(l=>l.offerId!==d.id); this.logAct(db,'deleted','offer',d.id,d.label,''); }
      if(d.kind==='asset'){ db.assets=db.assets.filter(a=>a.id!==d.id); db.links=db.links.filter(l=>l.assetId!==d.id); this.logAct(db,'deleted','asset',d.id,d.label,''); }
      if(d.kind==='cta'){ db.ctas=db.ctas.filter(c=>c.id!==d.id); this.logAct(db,'deleted','cta',d.id,d.label,''); }
      if(d.kind==='service'){ db.services=db.services.filter(x=>x.id!==d.id); db.offers.forEach(o=>{ if(o.serviceId===d.id) o.serviceId=null; }); this.logAct(db,'deleted','service',d.id,d.label,''); }
      if(d.kind==='person'){ db.users=db.users.filter(u=>u.id!==d.id); this.logAct(db,'removed','person',d.id,d.label,''); }
      if(d.kind==='angle'){ db.angles=db.angles.filter(x=>x.id!==d.id); db.offers.forEach(o=>{ o.angles=(o.angles||[]).filter(x=>x!==d.id); }); this.logAct(db,'deleted','angle',d.id,d.label,''); }
      if(d.kind==='client'){ const bs=db.brands.filter(b=>b.clientId===d.id).map(b=>b.id); db.brands=db.brands.filter(b=>b.clientId!==d.id); const os=db.offers.filter(o=>bs.indexOf(o.brandId)>=0).map(o=>o.id); db.offers=db.offers.filter(o=>bs.indexOf(o.brandId)<0); db.assets=db.assets.filter(a=>bs.indexOf(a.brandId)<0); db.links=db.links.filter(l=>os.indexOf(l.offerId)<0); db.clients=db.clients.filter(c=>c.id!==d.id); this.logAct(db,'deleted','client',d.id,d.label,''); }
      if(d.kind==='brand'){ const os=db.offers.filter(o=>o.brandId===d.id).map(o=>o.id); db.offers=db.offers.filter(o=>o.brandId!==d.id); db.assets=db.assets.filter(a=>a.brandId!==d.id); db.links=db.links.filter(l=>os.indexOf(l.offerId)<0); db.brands=db.brands.filter(b=>b.id!==d.id&&b.parentId!==d.id); this.logAct(db,'deleted','brand',d.id,d.label,''); }
    },'del');
    const back=this.state.draft.back;
    this.setState({modal:null,draft:{},drawer:null});
    if(back) setTimeout(()=>this.go(back.view,back.id,back.tab),0);
  }
  setStatus(kind,id,status){
    if(!this.can('edit')) return;
    this.commit(db=>{
      const arr=kind==='asset'?db.assets:db.offers; const i=arr.findIndex(x=>x.id===id);
      if(i>=0){ const old=arr[i].status; arr[i].status=status; arr[i].ago='just now'; this.logAct(db,'changed status','asset',id,arr[i].name,(old+' → '+status)); }
    });
  }
  resetAll(){ try{ localStorage.removeItem(this.key()); }catch(e){} const db=this.seed(); this.persist(db); this.setState({db,view:'street',vid:null,drawer:null,modal:null,cmdk:false,nudge:null}); }

  /* ---------------- modal helpers ---------------- */
  MODALPERM(){ return {
    new:'edit',offer:'edit',asset:'edit',service:'edit',brand:'edit',client:'edit',cta:'edit',
    goal:'edit',mergeGoal:'edit',clone:'edit',link:'edit',linkAsset:'edit',
    person:'access',confirm:'del',sendReview:'review',reqChanges:'review'
  }; }
  open(kind,draft,step){
    const need=this.MODALPERM()[kind];
    if(need&&!this.can(need)) return;
    this.setState({modal:kind,draft:draft||{},step:step||0,cmdk:false});
  }
  field(name){
    if(!this._on[name]) this._on[name]=e=>{ const v=e&&e.target?(e.target.type==='checkbox'?e.target.checked:e.target.value):e; this.setState(s=>({draft:Object.assign({},s.draft,{[name]:v})})); };
    return this._on[name];
  }
  toggleDraftOffer(oid){ this.setState(s=>{ const cur=(s.draft._offers||[]).slice(); const i=cur.indexOf(oid); if(i>=0) cur.splice(i,1); else cur.push(oid); return {draft:Object.assign({},s.draft,{_offers:cur})}; }); }

  /* ---------------- search ---------------- */
  search(q){
    const t=(q||'').trim().toLowerCase(); if(!t) return [];
    const out=[]; const hit=s=>String(s||'').toLowerCase().indexOf(t)>=0;
    this.db.clients.filter(c=>this.seesClient(c.id)).forEach(c=>{ if(hit(c.name)||hit(c.kind)) out.push({kind:'Client',id:c.id,title:c.name,sub:(c.archived?'Archived · ':'')+c.kind,code:'CL',color:'#6E7C76'}); });
    this.db.brands.filter(b=>this.seesBrand(b.id)).forEach(b=>{ if(hit(b.name)||hit(b.tagline)) out.push({kind:'Brand',id:b.id,title:b.name,sub:(this.client(b.clientId)||{}).name+' · '+b.tagline,code:b.mark,color:b.primary}); });
    this.db.offers.filter(o=>this.seesBrand(o.brandId)).forEach(o=>{ if(hit(o.name)||hit(o.short)||hit(o.positioning)){ const b=this.brand(o.brandId)||{}; out.push({kind:'Offer',id:o.id,title:o.name,sub:(o.archived?'Archived · ':'')+b.name+' · '+o.segment,code:'OF',color:b.primary||'#6E7C76'}); } });
    this.db.assets.filter(a=>!a.brandId||this.seesBrand(a.brandId)).forEach(a=>{ if(hit(a.name)||hit(a.short)||hit(a.type)||hit((a.tags||[]).join(' '))||hit(a.notes)){ const b=a.brandId?this.brand(a.brandId):null; const ofs=this.linkedOffers(a.id); out.push({kind:'Asset',id:a.id,title:a.name,sub:(a.archived?'Archived · ':'')+(b?b.name:'Global Library')+' · '+a.type+(ofs.length?(' · '+ofs.length+' offers'):''),code:this.codeOf(a),color:b?b.primary:'#6E7C76'}); } });
    (this.db.services||[]).filter(v=>this.seesBrand(v.brandId)).forEach(v=>{ if(hit(v.name)||hit(v.short)||hit(v.description)){ const b=this.brand(v.brandId)||{}; out.push({kind:'Service',id:v.id,title:v.name,sub:b.name+' · '+this.offersOfService(v.id).length+' offers',code:'SVC',color:b.primary||'#6E7C76'}); } });
    this.db.ctas.forEach(c=>{ if(hit(c.text)||hit(c.url)){ const b=this.brand(c.brandId)||{}; out.push({kind:'CTA',id:c.id,title:c.text,sub:b.name+' · '+c.url,code:'CTA',color:c.bg==='transparent'?c.fg:c.bg}); } });
    return out;
  }

  /* ---------------- view builders ---------------- */
  navRow(active){ return active?{bg:'var(--bos-soft)',fg:'#101614',weight:'600'}:{bg:'transparent',fg:'#5C6B64',weight:'500'}; }
  brandTabs(bid,active){
    const s=this.state; const keys=[['home','Home'],['services','Services'],['offers','Offers'],['assets','Assets'],['kit','Brand Kit'],['ctas','CTAs']];
    return keys.map(k=>{
      const on=s.view==='brand'&&s.vid===bid&&s.brandTab===k[0];
      return {key:k[0],label:k[1],click:()=>this.go('brand',bid,k[0]),bg:on?'var(--bos-soft)':'transparent',fg:on?'#101614':'#7C8A83',weight:on?'600':'500',bar:on?'var(--bos-accent)':'#E8EDEB'};
    });
  }
  assetCard(a){
    const b=a.brandId?this.brand(a.brandId):null;
    const ofs=this.linkedOffers(a.id);
    const col=b?b.primary:'#6C7B74';
    return {
      id:a.id,name:a.name,short:a.short||a.type,type:a.type,code:this.codeOf(a),
      tileBg:this.hexA(col,0.10),tileFg:col,
      status:a.status,statBg:this.hexA(this.ASTAT()[a.status]||'#9AA6A0',0.14),statFg:this.ASTAT()[a.status]||'#9AA6A0',
      review:a.review||'None',hasReview:(a.review&&a.review!=='None'),
      isList:a.type==='Checklist',listLabel:a.type==='Checklist'?((a.items||[]).length+' checks'):'',
      isPrompt:a.type==='Prompt',promptFor:a.promptFor||'',
      revBg:this.hexA(this.REVCOL()[a.review||'None'],0.15),revFg:this.REVCOL()[a.review||'None']||'#93A09A',
      cmtCount:this.openCount('asset',a.id)+(this.openCount('asset',a.id)===1?' open note':' open notes'),hasCmt:this.openCount('asset',a.id)>0,
      archived:!!a.archived,dim:a.archived?'.55':'1',
      linkLabel:ofs.length===0?'Not linked yet':(ofs.length===1?'Linked to 1 offer':('Linked to '+ofs.length+' offers')),
      linkColor:ofs.length===0?'#C99A2E':'#6E7C76',
      version:'v'+(a.version||1),owner:this.user(a.owner).initials,ago:a.ago,
      brandName:b?b.name:'Global Library',
      click:()=>this.openAsset(a.id)
    };
  }
  offerCard(o){
    const ac=this.linkedAssetIds(o.id).length;
    return {
      id:o.id,name:o.name,short:o.short,positioning:o.positioning,
      segment:o.segment,segBg:this.hexA(this.AUD()[o.segment]||'#6B7280',0.13),segFg:this.AUD()[o.segment]||'#6B7280',
      status:o.status,statBg:this.hexA(this.OSTAT()[o.status]||'#9AA6A0',0.14),statFg:this.OSTAT()[o.status]||'#9AA6A0',
      assetLabel:ac===0?'No assets yet':(ac===1?'1 asset':(ac+' assets')),
      assetWarn:ac===0?'#C99A2E':'#6E7C76',
      serviceName:o.serviceId?((this.service(o.serviceId)||{}).name||''):'Standalone',
      goalNames:this.goalChips(o),
      bar:this.bar(this.linkedAssets(o.id)),
      archived:!!o.archived,dim:o.archived?'.55':'1',
      cmtCount:this.openCount('offer',o.id)+(this.openCount('offer',o.id)===1?' note':' notes'),hasCmt:this.openCount('offer',o.id)>0,
      offerType:o.offerType||'',
      reviewState:o.review||'None',
      reviewBg:this.hexA(this.REVCOL()[o.review||'None'],0.14),reviewFg:this.REVCOL()[o.review||'None']||'#93A09A',
      inReview:(o.review&&o.review!=='None'),
      owner:this.user(o.owner).initials,ago:o.ago,
      click:()=>this.go('offer',o.id)
    };
  }

  renderVals(){
    const s=this.state, db=this.db, V={};
    const me=this.user(this.meId());
    const ab=this.activeBrand();

    /* ---- shell ---- */
    V.me={name:me.name,initials:me.initials};
    V.goStreet=()=>this.go('street');
    V.goLibrary=()=>this.go('library');
    V.openCmdk=()=>this.setState({cmdk:true,q:''});
    V.openNew=()=>this.open('new');
    V.newClient=()=>this.open('client',{});
    V.resetDemo=()=>this.resetAll();
    V.canEdit=this.can('edit'); V.canReview=this.can('review'); V.canComment=this.can('comment');
    V.canDel=this.can('del'); V.canArchive=this.can('archive'); V.canAccess=this.can('access');
    V.readOnly=!this.can('edit');
    V.meAccess=me.access||'Viewer';
    V.accBg=this.hexA(this.ACCCOL()[me.access]||'#6E7C76',0.14);
    V.accFg=this.ACCCOL()[me.access]||'#6E7C76';
    V.readOnlyText=(me.access==='Reviewer')?'Reviewer — you can approve, send back and comment, but not edit.':'Viewer — read only. Ask an admin if you need to change something.';
    V.scopeSummary=this.scopeLabel(this.meId());
    V.goTeam=()=>this.go('team');
    const tr=this.navRow(s.view==='team'); V.teamBg=tr.bg; V.teamFg=tr.fg; V.teamWeight=tr.weight;
    V.teamCount=String(db.users.length);
    const myQ=this.queue().filter(q=>q.who===this.meId());
    const otherQ=this.queue().filter(q=>q.who!==this.meId());
    V.queueCount=String(myQ.length);
    V.queueLabel=myQ.length?'Your queue':'Nothing on you';
    V.queueBadgeBg=myQ.length?'var(--bos-accent)':'#E4EAE7';
    V.queueBadgeFg=myQ.length?'var(--bos-on)':'#7A8781';
    V.hasQueue=myQ.length>0;
    V.openInbox=()=>this.setState({inbox:true});
    V.closeInbox=()=>this.setState({inbox:false});
    V.inboxOpen=s.inbox;
    V.meRole=me.role||'';
    V.whoOpen=s.whoOpen;
    V.toggleWho=()=>this.setState(x=>({whoOpen:!x.whoOpen}));
    V.whoRows=db.users.map(u=>({id:u.id,name:u.name,role:u.role,initials:u.initials,
      count:this.queue(u.id).filter(q=>q.who===u.id).length,
      bg:u.id===this.meId()?'var(--bos-soft)':'transparent',
      click:()=>this.setMe(u.id)}));
    const qRow=q=>({id:q.kind+q.id,name:q.name,sub:q.sub,note:q.note,hasNote:!!q.note,
      verb:q.verb,ago:q.ago,
      badgeBg:this.hexA(q.act==='review'?'#C99A2E':'#C2410C',0.15),
      badgeFg:q.act==='review'?'#8A6A12':'#A63A12',
      whoName:this.user(q.who).name.split(' ')[0],whoInitials:this.user(q.who).initials,
      click:()=>{ this.setState({inbox:false}); if(q.kind==='asset') this.openAsset(q.id); else this.go('offer',q.id); }});
    V.inboxMine=myQ.map(qRow);
    V.inboxOthers=otherQ.map(qRow);
    V.inboxMineEmpty=myQ.length===0;
    V.inboxOthersEmpty=otherQ.length===0;
    V.inboxTitle=myQ.length?(myQ.length+(myQ.length===1?' thing needs you':' things need you')):'Nothing needs you';
    V.otherCountLabel=otherQ.length?(otherQ.length+' with other people'):'Nothing with anyone else';
    V.inBrand=!!ab; V.headMark=ab?ab.mark:'';
    V.accentLineOpacity=ab?'1':'0';
    const sr=this.navRow(s.view==='street'); V.streetBg=sr.bg; V.streetFg=sr.fg; V.streetWeight=sr.weight;
    const lr=this.navRow(s.view==='library'); V.libBg=lr.bg; V.libFg=lr.fg; V.libWeight=lr.weight;

    V.navClients=this.live(db.clients).filter(c=>this.seesClient(c.id)).map(c=>{
      const tops=this.live(db.brands).filter(b=>b.clientId===c.id&&!b.parentId&&this.seesBrand(b.id));
      const cr=this.navRow(s.view==='client'&&s.vid===c.id);
      return {id:c.id,name:c.name,brandCount:this.live(db.brands).filter(b=>b.clientId===c.id&&this.seesBrand(b.id)).length,
        click:()=>this.go('client',c.id),bg:cr.bg,fg:cr.fg,
        brands:tops.map(b=>{
          const on=(s.view==='brand'&&s.vid===b.id)||(s.view==='offer'&&(this.offer(s.vid)||{}).brandId===b.id);
          const r=this.navRow(on);
          return {id:b.id,name:b.name,dot:b.primary,click:()=>this.go('brand',b.id,'home'),bg:r.bg,fg:r.fg,weight:r.weight,
            showTabs:on,tabs:this.brandTabs(b.id),
            subs:this.live(this.subBrands(b.id)).filter(sb=>this.seesBrand(sb.id)).map(sb=>{
              const son=(s.view==='brand'&&s.vid===sb.id)||(s.view==='offer'&&(this.offer(s.vid)||{}).brandId===sb.id);
              const r2=this.navRow(son);
              return {id:sb.id,name:sb.name,dot:sb.primary,click:()=>this.go('brand',sb.id,'home'),bg:r2.bg,fg:r2.fg,weight:r2.weight,showTabs:son,tabs:this.brandTabs(sb.id)};
            })};
        })};
    });

    const crumbs=[];
    const push=(label,click,last)=>crumbs.push({label,click:click||(()=>{}),cursor:click?'pointer':'default',weight:last?'600':'500',color:last?'#101614':'#7C8A83',sep:last?'':'/',flexv:last?'none':('0 '+Math.max(1,String(label||'').length-6)+' auto'),mw:last?'auto':'0',ov:last?'visible':'hidden'});
    if(s.view==='street') push('The Street',null,true);
    if(s.view==='library'){ push('The Street',()=>this.go('street')); push('Global Library',null,true); }
    if(s.view==='client'){ const c=this.client(s.vid)||{}; push('The Street',()=>this.go('street')); push(c.name,null,true); }
    if(s.view==='brand'){
      const b=this.brand(s.vid)||{}; const p=b.parentId?this.brand(b.parentId):null; const c=this.client(b.clientId)||{};
      push('The Street',()=>this.go('street')); if(c.name!==b.name) push(c.name,()=>this.go('client',c.id));
      if(p) push(p.name,()=>this.go('brand',p.id,'home'));
      const tabLabel={home:'',offers:'Offers',assets:'Assets',kit:'Brand Kit',ctas:'CTAs'}[s.brandTab];
      if(tabLabel){ push(b.name,()=>this.go('brand',b.id,'home')); push(tabLabel,null,true); } else push(b.name,null,true);
    }
    if(s.view==='offer'){
      const o=this.offer(s.vid)||{}; const b=this.brand(o.brandId)||{}; const c=this.client(b.clientId)||{};
      push('The Street',()=>this.go('street')); if(c.name!==b.name) push(c.name,()=>this.go('client',c.id));
      push(b.name,()=>this.go('brand',b.id,'home'));
      const sv=o.serviceId?this.service(o.serviceId):null;
      if(sv){ push('Services',()=>this.go('brand',b.id,'services')); push(sv.name,()=>this.go('service',sv.id)); }
      else push('Offers',()=>this.go('brand',b.id,'offers'));
      push(o.name,null,true);
    }
    if(s.view==='service'){
      const sv=this.service(s.vid)||{}; const b=this.brand(sv.brandId)||{}; const c=this.client(b.clientId)||{};
      push('The Street',()=>this.go('street')); if(c.name!==b.name) push(c.name,()=>this.go('client',c.id));
      push(b.name,()=>this.go('brand',b.id,'home')); push('Services',()=>this.go('brand',b.id,'services')); push(sv.name,null,true);
    }
    V.crumbs=crumbs;

    V.isStreet=s.view==='street'; V.isClient=s.view==='client';
    V.isBrand=s.view==='brand'; V.isOffer=s.view==='offer'; V.isLibrary=s.view==='library'; V.isService=s.view==='service';

    /* ---- street ---- */
    const h=new Date().getHours();
    const part=h<12?'Good morning':(h<18?'Good afternoon':'Good evening');
    V.greeting=part+', '+me.name.split(' ')[0]+'.';
    const nRev=this.queue().length, nIde=db.offers.filter(o=>o.status==='Ideation').length;
    const vc=this.live(db.clients).filter(c=>this.seesClient(c.id)).length, vb=this.live(db.brands).filter(b=>this.seesBrand(b.id)).length;
    V.streetSub=vc+(vc===1?' property, ':' properties, ')+vb+(vb===1?' building. ':' buildings. ')+
      (nRev+nIde===0?'Nothing is moving through review.':(nRev+(nRev===1?' thing':' things')+' mid-review, '+nIde+' still just an idea.'));
    V.showActivity=(this.props.showActivity??true);
    V.libraryBlurb='Checklists, finalised prompts, templates and SOPs. Nothing in here belongs to a brand, so nothing in here is themed.';

    const ideation=db.offers.filter(o=>o.status==='Ideation'&&this.visibleTo('offer',o));
    const att=myQ.map(q=>({id:q.kind+q.id,label:q.name,sub:q.sub,
      dot:q.act==='review'?'#C99A2E':'#C2410C',badge:q.verb,
      badgeBg:this.hexA(q.act==='review'?'#C99A2E':'#C2410C',0.15),
      badgeFg:q.act==='review'?'#8A6A12':'#A63A12',
      click:()=>{ if(q.kind==='asset') this.openAsset(q.id); else this.go('offer',q.id); }}));
    const already={}; myQ.forEach(q=>{ already[q.kind+q.id]=1; });
    ideation.filter(o=>!already['offer'+o.id]).slice(0,3).forEach(o=>{
      const br=this.brand(o.brandId)||{}; const n=this.linkedAssetIds(o.id).length;
      att.push({id:o.id,label:o.name,sub:br.name+' · '+(n===1?'1 asset':n+' assets'),dot:'#7C6AC4',badge:'Ideation',badgeBg:this.hexA('#7C6AC4',0.15),badgeFg:'#5C4CA8',click:()=>this.go('offer',o.id)});
    });
    V.attention=att; V.attentionCount=myQ.length?(myQ.length+' on you'):'clear'; V.noAttention=att.length===0;
    V.attentionSub=myQ.length?('Assigned to you by name. '+V.otherCountLabel+'.'):('Nothing is assigned to you. '+V.otherCountLabel+'.');

    V.continueItems=(db.recents||[]).filter(r=>{
      if(r.k==='brand') return this.seesBrand(r.id)&&!this.isArch(this.brand(r.id));
      if(r.k==='offer') return this.visibleTo('offer',this.offer(r.id));
      if(r.k==='service'){ const v=this.service(r.id); return v&&!v.archived&&this.seesBrand(v.brandId); }
      return this.visibleTo('asset',this.asset(r.id));
    }).map(r=>{
      if(r.k==='brand'){ const b=this.brand(r.id); if(!b) return null; return {id:r.id,title:b.name,sub:'Brand · '+(this.client(b.clientId)||{}).name,code:b.mark,tileBg:this.hexA(b.primary,0.12),tileFg:b.primary,click:()=>this.go('brand',b.id,'home')}; }
      if(r.k==='offer'){ const o=this.offer(r.id); if(!o) return null; const b=this.brand(o.brandId)||{}; return {id:r.id,title:o.name,sub:'Offer · '+b.name,code:'OF',tileBg:this.hexA(b.primary||'#6C7B74',0.12),tileFg:b.primary||'#6C7B74',click:()=>this.go('offer',o.id)}; }
      if(r.k==='service'){ const v=this.service(r.id); if(!v) return null; const b=this.brand(v.brandId)||{}; return {id:r.id,title:v.name,sub:'Service · '+b.name,code:'SVC',tileBg:this.hexA(b.primary||'#6C7B74',0.12),tileFg:b.primary||'#6C7B74',click:()=>this.go('service',v.id)}; }
      const a=this.asset(r.id); if(!a) return null; const ab2=a.brandId?this.brand(a.brandId):null;
      return {id:r.id,title:a.name,sub:'Asset · '+(ab2?ab2.name:'Global Library'),code:this.codeOf(a),tileBg:this.hexA(ab2?ab2.primary:'#6C7B74',0.12),tileFg:ab2?ab2.primary:'#6C7B74',click:()=>this.openAsset(a.id)};
    }).filter(Boolean);
    V.noContinue=V.continueItems.length===0;

    const clCard=c=>{
      const bs=this.live(db.brands).filter(b=>b.clientId===c.id&&this.seesBrand(b.id));
      const ids=bs.map(b=>b.id);
      const os=this.live(db.offers).filter(o=>ids.indexOf(o.brandId)>=0);
      const as=this.live(db.assets).filter(a=>ids.indexOf(a.brandId)>=0);
      return {id:c.id,name:c.name,kind:c.kind,marks:bs.map(b=>({mark:b.mark,color:b.primary})),
        brandLabel:bs.length+(bs.length===1?' brand':' brands'),
        offerLabel:os.length+(os.length===1?' offer':' offers'),
        assetLabel:as.length+' assets',
        dim:c.archived?'.6':'1',
        click:()=>this.go('client',c.id)};
    };
    V.clientCards=this.expander(V,'cl',db.clients.filter(c=>this.seesClient(c.id)),clCard,'client').map(clCard);

    V.activityItems=db.activity.filter(a=>{
      if(a.type==='asset') return this.visibleTo('asset',this.asset(a.id));
      if(a.type==='offer') return this.visibleTo('offer',this.offer(a.id));
      if(a.type==='brand') return this.seesBrand(a.id);
      if(a.type==='service'){ const v=this.service(a.id); return v&&this.seesBrand(v.brandId); }
      if(a.type==='client') return this.seesClient(a.id);
      return true;
    }).slice(0,7).map(a=>{
      const u=this.user(a.user);
      return {id:a.id,initials:u.initials,ago:a.ago,
        text:u.name.split(' ')[0]+' '+a.action+' '+a.label+(a.field?(' — '+a.field):''),
        click:()=>{ if(a.type==='asset') this.openAsset(a.id); else if(a.type==='offer') this.go('offer',a.id); else if(a.type==='brand') this.go('brand',a.id,'home'); }};
    });

    V.isTeam=s.view==='team';
    if(s.view==='team'){
      V.teamRows=db.users.map(u=>({
        id:u.id,name:u.name,role:u.role,initials:u.initials,
        access:u.access||'Viewer',
        accBg:this.hexA(this.ACCCOL()[u.access]||'#6E7C76',0.14),
        accFg:this.ACCCOL()[u.access]||'#6E7C76',
        note:this.ACCNOTE()[u.access]||'',
        scope:this.scopeLabel(u.id),
        wide:u.all,
        queue:String(this.queue(u.id).filter(q=>q.who===u.id).length),
        isMe:u.id===this.meId(),
        meLabel:u.id===this.meId()?'You':'',
        viewAs:()=>this.setMe(u.id),
        edit:()=>this.open('person',Object.assign({},u,{clients:(u.clients||[]).slice(),groups:(u.groups||[]).slice(),brands:(u.brands||[]).slice()}))
      }));
      V.groupRows=(db.groups||[]).map(g=>({
        id:g.id,name:g.name,note:g.note,
        clients:(g.clients||[]).map(c=>({name:(this.client(c)||{}).name})).filter(x=>x.name),
        members:db.users.filter(u=>(u.groups||[]).indexOf(g.id)>=0).map(u=>({initials:u.initials,name:u.name})),
        memberLabel:(n=>n+(n===1?' person':' people'))(db.users.filter(u=>(u.groups||[]).indexOf(g.id)>=0).length)
      }));
      V.accessKey=this.ACCESS().map(a=>({name:a,note:this.ACCNOTE()[a],
        bg:this.hexA(this.ACCCOL()[a],0.14),fg:this.ACCCOL()[a],
        count:String(db.users.filter(u=>u.access===a).length)}));
      V.invite=()=>this.open('person',{name:'',role:'',access:'Editor',all:false,clients:[],brands:[],groups:[]});
    }

    /* ---- client page ---- */
    if(s.view==='client'){
      const c=this.client(s.vid);
      if(c){
        const bs=db.brands.filter(b=>b.clientId===c.id);
        const ids=bs.map(b=>b.id);
        const os=db.offers.filter(o=>ids.indexOf(o.brandId)>=0);
        const as=db.assets.filter(a=>ids.indexOf(a.brandId)>=0);
        V.cl={name:c.name,kind:c.kind,note:c.note,since:c.since,contact:this.user(c.contact).name};
        V.clStats=[{label:'Brands',value:String(bs.length)},{label:'Offers',value:String(os.length)},{label:'Assets',value:String(as.length)},{label:'Client since',value:c.since}];
        V.clBrands=this.live(bs).filter(b=>!b.parentId&&this.seesBrand(b.id)).map(b=>({
          id:b.id,name:b.name,mark:b.mark,tagline:b.tagline,primary:b.primary,
          tileBg:this.hexA(b.primary,0.10),
          offerLabel:this.offersOf(b.id).length+' offers',
          assetLabel:this.assetsOf(b.id).length+' assets',
          subLabel:this.subBrands(b.id).length?(this.subBrands(b.id).length+' sub-brand'+(this.subBrands(b.id).length>1?'s':'')):'',
          subs:this.subBrands(b.id).map(sb=>({id:sb.id,name:sb.name,mark:sb.mark,primary:sb.primary,click:()=>this.go('brand',sb.id,'home')})),
          click:()=>this.go('brand',b.id,'home')}));
        V.clRecent=as.slice().sort((a,b)=>(a.ago||'').length-(b.ago||'').length).slice(0,4).map(a=>this.assetCard(a));
        V.clActivity=db.activity.filter(a=>{
          if(a.type==='asset'){ const x=this.asset(a.id); return x&&ids.indexOf(x.brandId)>=0; }
          if(a.type==='offer'){ const x=this.offer(a.id); return x&&ids.indexOf(x.brandId)>=0; }
          if(a.type==='brand') return ids.indexOf(a.id)>=0;
          return false;
        }).slice(0,6).map(a=>{ const u=this.user(a.user); return {id:a.id,initials:u.initials,ago:a.ago,text:u.name.split(' ')[0]+' '+a.action+' '+a.label+(a.field?(' — '+a.field):''),click:()=>{ if(a.type==='asset') this.openAsset(a.id); else if(a.type==='offer') this.go('offer',a.id); }}; });
        V.clNewBrand=()=>this.open('brand',{clientId:c.id});
        V.clEdit=()=>this.open('client',Object.assign({},c));
        V.clDelete=()=>this.open('confirm',{kind:'client',id:c.id,label:c.name,back:{view:'street'}});
        V.clArchived=!!c.archived;
        V.clArchLabel=c.archived?'Restore client':'Archive client';
        V.clArchive=()=>this.setArchived('client',c.id,!c.archived);
        V.clArchNote='Archived. Hidden from the street and from search unless you go looking.';
      }
    }

    /* ---- brand pages ---- */
    if(s.view==='brand'){
      const b=this.brand(s.vid);
      if(b){
        const os=this.offersOf(b.id);
        const as=this.assetsOf(b.id);
        const camp=as.filter(a=>this.catOf(a)==='campaign');
        const tpl=as.filter(a=>a.isTemplate);
        const bc=this.db.ctas.filter(c=>c.brandId===b.id);
        V.br={name:b.name,mark:b.mark,tagline:b.tagline,description:b.description,voice:b.voice,boilerplate:b.boilerplate,primary:b.primary,secondary:b.secondary};
        V.brWelcome='Welcome to '+b.name;
        V.brTab=s.brandTab;
        V.tabHome=s.brandTab==='home'; V.tabOffers=s.brandTab==='offers'; V.tabServices=s.brandTab==='services';
        V.tabAssets=s.brandTab==='assets'; V.tabKit=s.brandTab==='kit'; V.tabCtas=s.brandTab==='ctas';
        V.brParent=b.parentId?(this.brand(b.parentId)||{}).name:'';
        V.brIsSub=!!b.parentId;
        V.brStats=[
          {label:'Offers',value:String(os.length),click:()=>this.go('brand',b.id,'offers')},
          {label:'Assets',value:String(camp.length),click:()=>this.go('brand',b.id,'assets')},
          {label:'CTAs',value:String(bc.length),click:()=>this.go('brand',b.id,'ctas')},
          {label:'Templates',value:String(tpl.length),click:()=>this.go('brand',b.id,'kit')},
          {label:'Team',value:String(b.team||1),click:()=>{}}
        ].map((x,i,arr)=>Object.assign(x,{bdr:i===arr.length-1?'transparent':'var(--bos-border)'}));
        V.brActions=[
          {label:'Create an offer',sub:'Positioning first, assets after',show:this.can('edit'),click:()=>this.open('offer',{brandId:b.id,serviceId:'',segment:'All segments',goals:[],status:'Ideation',owner:this.meId(),primaryCta:'',secondaryCta:''}),primary:true},
          {label:'Add an asset',sub:'Landing page, email, ad, document',show:this.can('edit'),click:()=>this.open('asset',{brandId:b.id,status:'Draft',owner:this.meId(),_offers:[]},0),primary:false},
          {label:'View the Brand Kit',sub:'Logos, colours, fonts, guidelines',show:true,click:()=>this.go('brand',b.id,'kit'),primary:false},
          {label:'Browse the library',sub:'Everything reusable in this brand',show:true,click:()=>this.go('brand',b.id,'assets'),primary:false}
        ];
        V.brSubs=this.subBrands(b.id).map(sb=>({id:sb.id,name:sb.name,mark:sb.mark,tagline:sb.tagline,primary:sb.primary,tileBg:this.hexA(sb.primary,0.10),assetLabel:this.assetsOf(sb.id).length+' assets',click:()=>this.go('brand',sb.id,'home')}));
        V.brHasSubs=V.brSubs.length>0;
        V.brNewSub=()=>this.open('brand',{clientId:b.clientId,parentId:b.id});
        const byType={}; camp.forEach(a=>{ (byType[a.type]=byType[a.type]||[]).push(a); });
        V.inventory=Object.keys(byType).sort((x,y)=>byType[y].length-byType[x].length).map(t=>({
          type:t,count:String(byType[t].length),
          blocks:this.bar(byType[t]),
          click:()=>this.setState({astType:t,astStat:'All',astQ:''},()=>this.go('brand',b.id,'assets'))
        }));
        V.inventoryTotal=camp.length+(camp.length===1?' asset':' assets')+' in this building';
        V.hasInventory=camp.length>0;
        const rc={Approved:0,'In review':0,'Changes requested':0,None:0};
        camp.forEach(a=>{ rc[a.review||'None']=(rc[a.review||'None']||0)+1; });
        V.invLegend=[{label:'Approved',n:String(rc['Approved']||0),color:'#2F8F62'},
          {label:'In review',n:String(rc['In review']||0),color:'#C99A2E'},
          {label:'Changes requested',n:String(rc['Changes requested']||0),color:'#C2410C'},
          {label:'Not reviewed',n:String(rc['None']||0),color:'#CBD6D1'}];
        V.brRecent=camp.slice(0,4).map(a=>this.assetCard(a));
        V.brRecentEmpty=camp.length===0;
        const svcs=this.servicesOf(b.id);
        const gridBy=(s.gridByBrand||{})[b.id]||'goal';
        const colVals=gridBy==='goal'?this.goalNamesOf(b.id):(gridBy==='type'?this.OTYPES():(b.segments||[]).map(x=>x.name));
        const matches=(o,col)=>gridBy==='goal'?((o.goals||[]).indexOf(col)>=0):(gridBy==='type'?o.offerType===col:o.segment===col);
        const prefill=col=>gridBy==='goal'?{goals:[col]}:(gridBy==='type'?{offerType:col}:{segment:col});
        const stand=this.standaloneOffers(b.id);
        V.brStats.splice(1,0,{label:'Services',value:String(svcs.length),click:()=>this.go('brand',b.id,'services'),bdr:'var(--bos-border)'});
        V.svcCards=this.expander(V,'svc',svcs,v=>({id:v.id,name:v.name,short:v.short,description:v.description,offerLabel:this.offersOfService(v.id).length+' offers',assetLabel:this.assetsOfService(v.id).length+' assets',segList:[],bar:[],hasGap:false,gapLabel:'',click:()=>this.go('service',v.id)}),'service').map(v=>{
          const so=this.offersOfService(v.id);
          const segs={}; so.forEach(o=>{segs[o.segment]=1;});
          return {id:v.id,name:v.name,short:v.short,description:v.description,
            offerLabel:so.length+(so.length===1?' offer':' offers'),
            assetLabel:this.assetsOfService(v.id).length+' assets',
            segList:Object.keys(segs).map(n=>({name:n,bg:this.hexA(this.segColor(n),0.13),fg:this.segColor(n)})),
            bar:this.bar(this.assetsOfService(v.id).map(x=>this.asset(x)).filter(Boolean)),
            gapLabel:(b.segments||[]).filter(x=>x.name!=='All segments'&&!segs[x.name]).map(x=>x.name).join(', '),
            hasGap:!segs['All segments']&&(b.segments||[]).some(x=>x.name!=='All segments'&&!segs[x.name])&&so.length>0,
            click:()=>this.go('service',v.id)};
        });
        V.svcEmpty=svcs.length===0;
        V.standCards=stand.map(o=>this.offerCard(o));
        V.hasStandalone=stand.length>0;
        V.newService=()=>this.open('service',{brandId:b.id});
        V.gridCols=colVals.map(n=>({id:n,name:n}));
        V.hasGrid=colVals.length>0&&svcs.length>0;
        V.gridCaption=this.can('edit')?'A number is how many offers argue that way. A plus is a gap — click it to write one. Whichever view you pick becomes this brand’s default for you.':'A number is how many offers argue that way. A dot is a gap nobody has written yet. Whichever view you pick becomes this brand’s default for you.';
        V.gridAxisLabel='Service · '+(gridBy==='goal'?'Goal':(gridBy==='type'?'Offer type':'Segment'));
        V.gridSwitch=[['goal','Goal'],['type','Offer type'],['segment','Segment']].map(k=>({label:k[1],
          bg:gridBy===k[0]?'#101614':'#FFFFFF',fg:gridBy===k[0]?'#FFFFFF':'#5C6B64',
          bd:gridBy===k[0]?'#101614':'var(--bos-border)',
          click:()=>this.setState(x=>({gridByBrand:Object.assign({},x.gridByBrand,{[b.id]:k[0]})}))}));
        const rowFor=(label,list,sid)=>({
          id:sid||'none',label,
          click:sid?(()=>this.go('service',sid)):(()=>this.go('brand',b.id,'offers')),
          cells:colVals.map(col=>{
            const hits=list.filter(o=>matches(o,col));
            const n=hits.length;
            const ed=this.can('edit');
            return {id:col,n:n?String(n):(ed?'+':'·'),gap:!n,
              cur:(n||ed)?'pointer':'default',
              bg:n?this.hexA(b.primary,0.10+Math.min(n,4)*0.05):'#FFFFFF',
              fg:n?b.primary:'#8B9791',
              bd:n?'transparent':'var(--bos-border)',
              title:n?(hits.map(o=>o.name).join(' · ')):'No offer here yet',
              click:n?(()=>{ if(sid) this.go('service',sid); else this.go('brand',b.id,'offers'); })
                     :(ed?(()=>this.open('offer',Object.assign({brandId:b.id,serviceId:sid||'',segment:'All segments',goals:[],status:'Ideation',owner:this.meId(),primaryCta:'',secondaryCta:''},prefill(col)))):(()=>{}))};
          })
        });
        V.gridRows=svcs.map(v=>rowFor(v.name,this.offersOfService(v.id),v.id));
        if(stand.length) V.gridRows.push(rowFor('Standalone',stand,null));
        V.gridGaps=V.gridRows.reduce((n,r)=>n+r.cells.filter(c=>c.gap).length,0);
        V.gridGapLabel=V.gridGaps+(V.gridGaps===1?' combination not written yet':' combinations not written yet');
        V.kitAngles=this.goalsOf(b.id).map(g=>{
          const n=os.filter(o=>(o.goals||[]).indexOf(g.name)>=0).length;
          const c=this.goalColor(b.id,g.name);
          return {id:g.name,name:g.name,description:g.description||'',
            color:c,bg:this.hexA(c,0.13),
            useLabel:n?(n+' offer'+(n>1?'s':'')):'None yet',
            useColor:n?'#6E7C76':'#C99A2E',
            viewClick:()=>this.open('goalOffers',{brandId:b.id,name:g.name}),
            editClick:()=>this.open('goal',{brandId:b.id,name:g.name,description:g.description||'',original:g.name}),
            mergeClick:()=>this.open('mergeGoal',{brandId:b.id,from:g.name,into:''})};
        });
        V.kitAnglesEmpty=this.goalsOf(b.id).length===0;
        V.newGoal=()=>this.open('goal',{brandId:b.id,name:'',description:''});
        V.goalCountLabel=this.goalsOf(b.id).length+' goals · five is usually enough';
        V.kitTypes=this.OTYPES().map(t=>{
          const n=os.filter(o=>o.offerType===t).length;
          return {name:t,useLabel:n?(n+' offer'+(n>1?'s':'')):'None yet',useColor:n?'#6E7C76':'#C99A2E'};
        });
        V.kitSegments=(b.segments||[]).map(sg=>{
          const n=this.db.offers.filter(o=>o.brandId===b.id&&o.segment===sg.name).length;
          return {name:sg.name,color:sg.color,bg:this.hexA(sg.color,0.13),useLabel:n+(n===1?' offer':' offers')};
        });
        V.brEdit=()=>this.open('brand',Object.assign({},b));
        V.brDelete=()=>this.open('confirm',{kind:'brand',id:b.id,label:b.name,back:{view:'client',id:b.clientId}});
        V.brArchived=!!b.archived;
        V.brArchLabel=b.archived?'Restore brand':'Archive brand';
        V.brArchive=()=>this.setArchived('brand',b.id,!b.archived);
        V.brArchNote='Archived. Everything inside is untouched and comes back exactly as it was.';

        /* offers tab */
        const audOn=s.offAud, statOn=s.offStat;
        const audsPresent=['All'].concat(Object.keys(this.AUD()).filter(k=>os.some(o=>o.segment===k)));
        V.offSegFilters=audsPresent.map(k=>({label:k,active:audOn===k,bg:audOn===k?'var(--bos-accent)':'#FFFFFF',fg:audOn===k?'var(--bos-on)':'#5C6B64',bd:audOn===k?'var(--bos-accent)':'var(--bos-border)',click:()=>this.setState({offAud:k})}));
        V.offStatFilters=['All'].concat(Object.keys(this.OSTAT())).map(k=>({label:k,active:statOn===k,bg:statOn===k?'var(--bos-accent)':'#FFFFFF',fg:statOn===k?'var(--bos-on)':'#5C6B64',bd:statOn===k?'var(--bos-accent)':'var(--bos-border)',click:()=>this.setState({offStat:k})}));
        const fo=os.filter(o=>(audOn==='All'||o.segment===audOn)&&(statOn==='All'||o.status===statOn));
        const filteredOffers=this.expander(V,'off',fo,o=>this.offerCard(o),'offer');
        V.offerCards=filteredOffers.map(o=>this.offerCard(o));
        V.offersEmpty=filteredOffers.length===0;
        V.offersEmptyMsg=os.length===0?'No offers in this building yet. An offer is a room — it holds the positioning and everything that supports it.':'Nothing matches those filters.';
        V.newOffer=()=>this.open('offer',{brandId:b.id,segment:'All segments',angles:[],serviceId:'',status:'Ideation',owner:'pr',primaryCta:'',secondaryCta:''});

        /* assets tab */
        const tOn=s.astType, aOn=s.astStat, qOn=(s.astQ||'').toLowerCase();
        const typesPresent=['All'].concat(Object.keys(this.TYPES()).filter(k=>camp.some(a=>a.type===k)));
        V.astTypeFilters=typesPresent.map(k=>({label:k,active:tOn===k,bg:tOn===k?'var(--bos-accent)':'#FFFFFF',fg:tOn===k?'var(--bos-on)':'#5C6B64',bd:tOn===k?'var(--bos-accent)':'var(--bos-border)',click:()=>this.setState({astType:k})}));
        V.astStatFilters=['All'].concat(Object.keys(this.ASTAT())).map(k=>({label:k,active:aOn===k,bg:aOn===k?'var(--bos-accent)':'#FFFFFF',fg:aOn===k?'var(--bos-on)':'#5C6B64',bd:aOn===k?'var(--bos-accent)':'var(--bos-border)',click:()=>this.setState({astStat:k})}));
        V.astQ=s.astQ; V.onAstQ=e=>this.setState({astQ:e.target.value});
        const fa=camp.filter(a=>(tOn==='All'||a.type===tOn)&&(aOn==='All'||a.status===aOn)&&(!qOn||(a.name+' '+a.short+' '+(a.tags||[]).join(' ')).toLowerCase().indexOf(qOn)>=0));
        V.assetCards=this.expander(V,'ast',fa,a=>this.assetCard(a),'asset').map(a=>this.assetCard(a));
        V.assetsEmpty=fa.length===0;
        V.assetsEmptyMsg=camp.length===0?'Nothing in this building yet. Start with the thing you actually need — a landing page, an email, an ad.':'Nothing matches that search.';
        V.assetCount=camp.length+(camp.length===1?' asset':' assets');
        V.unlinkedCount=camp.filter(a=>this.linkedOffers(a.id).length===0).length;
        V.hasUnlinked=V.unlinkedCount>0;
        V.unlinkedLabel=V.unlinkedCount+' not linked to any offer';
        V.showUnlinked=()=>this.setState({astType:'All',astStat:'All',astQ:''});
        V.newAsset=()=>this.open('asset',{brandId:b.id,status:'Draft',owner:'pr',_offers:[]},0);

        /* brand kit */
        V.kitLogos=as.filter(a=>a.type==='Logo').map(a=>this.assetCard(a));
        V.kitFontAssets=as.filter(a=>a.type==='Font').map(a=>this.assetCard(a));
        V.kitColours=(b.colours||[]).map(c=>({name:c.name,hex:c.hex,usage:c.usage,fg:this.onColor(c.hex),click:()=>{ try{ navigator.clipboard.writeText(c.hex); }catch(e){} }}));
        V.kitFonts=b.fonts||[];
        V.kitGuidelines=(b.guidelines||[]).map(g=>({name:g.name,size:g.size}));
        V.kitTemplates=tpl.map(a=>this.assetCard(a));
        V.kitTemplatesEmpty=tpl.length===0;
        V.kitVoice=b.voice; V.kitBoilerplate=b.boilerplate;
        V.kitLogosEmpty=V.kitLogos.length===0;

        /* ctas */
        V.ctaRows=bc.map(c=>{
          const used=db.offers.filter(o=>o.primaryCta===c.id||o.secondaryCta===c.id).map(o=>o.name);
          const onA=db.assets.filter(a=>a.ctaId===c.id).map(a=>a.name);
          const all=used.concat(onA);
          return {id:c.id,text:c.text,url:c.url,style:c.style,
            bg:c.style==='outline'?'transparent':c.bg,fg:c.fg,
            bd:c.style==='outline'?c.fg:'transparent',
            usedIn:all.length?('Used in '+all.length+' place'+(all.length>1?'s':'')):'Not used yet',
            usedColor:all.length?'#6E7C76':'#C99A2E',
            usedList:all.slice(0,3).join(' · '),
            editClick:()=>this.open('cta',Object.assign({},c)),
            delClick:()=>this.open('confirm',{kind:'cta',id:c.id,label:c.text})};
        });
        V.ctasEmpty=bc.length===0;
        V.newCta=()=>this.open('cta',{brandId:b.id,bg:b.primary,fg:this.onColor(b.primary),style:'solid',text:'',url:''});
      }
    }

    /* ---- service view ---- */
    if(s.view==='service'){
      const v=this.service(s.vid);
      if(v){
        const b=this.brand(v.brandId)||{};
        const so=this.offersOfService(v.id);
        V.sv={name:v.name,short:v.short,description:v.description,owner:this.user(v.owner).name,ago:v.ago};
        V.svOfferCount=so.length+(so.length===1?' offer':' offers');
        V.svAssetCount=this.assetsOfService(v.id).length+' assets across them';
        V.svGroups=(b.segments||[]).map(sg=>{
          const list=so.filter(o=>o.segment===sg.name);
          return {name:sg.name,bg:this.hexA(sg.color,0.13),fg:sg.color,
            has:list.length>0,empty:list.length===0,
            countLabel:list.length?(list.length+(list.length===1?' offer':' offers')):'Nothing written for this segment',
            cards:list.map(o=>this.offerCard(o)),
            create:()=>this.open('offer',{brandId:b.id,serviceId:v.id,segment:sg.name,angles:[],status:'Ideation',owner:'pr',primaryCta:'',secondaryCta:''})};
        }).filter(g=>g.name!=='All segments'||g.has);
        V.svNewOffer=()=>this.open('offer',{brandId:b.id,serviceId:v.id,segment:'All segments',angles:[],status:'Ideation',owner:'pr',primaryCta:'',secondaryCta:''});
        V.svEdit=()=>this.open('service',Object.assign({},v));
        V.svDelete=()=>this.open('confirm',{kind:'service',id:v.id,label:v.name,back:{view:'brand',id:v.brandId,tab:'services'}});
        V.svArchived=!!v.archived;
        V.svArchLabel=v.archived?'Restore service':'Archive service';
        V.svArchive=()=>this.setArchived('service',v.id,!v.archived);
        V.svArchNote='Archived. Its offers still exist and are reachable from the offers tab.';
        V.svBrandName=b.name;
      }
    }

    /* ---- offer detail ---- */
    if(s.view==='offer'){
      const o=this.offer(s.vid);
      if(o){
        const b=this.brand(o.brandId)||{};
        const la=this.linkedAssets(o.id);
        V.of={name:o.name,short:o.short,positioning:o.positioning,angle:o.angle,promise:o.promise,proof:o.proof,
          segment:o.segment,status:o.status,owner:this.user(o.owner).name,ownerInitials:this.user(o.owner).initials,ago:o.ago,
          segBg:this.hexA(this.AUD()[o.segment]||'#6B7280',0.13),segFg:this.AUD()[o.segment]||'#6B7280',
          statBg:this.hexA(this.OSTAT()[o.status]||'#9AA6A0',0.14),statFg:this.OSTAT()[o.status]||'#9AA6A0'};
        V.ofTags=o.tags||[];
        V.ofServiceName=o.serviceId?((this.service(o.serviceId)||{}).name||''):'';
        V.ofHasService=!!o.serviceId;
        V.ofServiceClick=()=>{ if(o.serviceId) this.go('service',o.serviceId); };
        V.ofAngles=this.goalChips(o).map(g=>({id:g.name,name:g.name,bg:g.bg,fg:g.fg}));
        V.ofNoAngles=V.ofAngles.length===0;
        V.ofType=o.offerType||'';
        V.ofHasType=!!o.offerType;
        const ow=this.waitOn('offer',o);
        V.ofReview=(!o.review||o.review==='None')?'Not reviewed':o.review;
        V.ofRevBg=this.hexA(this.REVCOL()[o.review||'None'],0.14);
        V.ofRevFg=this.REVCOL()[o.review||'None']||'#93A09A';
        V.ofWaiting=!!ow;
        V.ofWaitText=ow?(ow.verb+' — '+this.user(ow.who).name+(ow.who===this.meId()?' (you)':'')):'';
        V.ofNote=o.changeNote||'';
        V.ofHasNote=!!o.changeNote;
        V.ofThread=this.thread('offer',o.id);
        V.ofThreadEmpty=V.ofThread.length===0;
        V.ofThreadCount=this.openCount('offer',o.id);
        V.ofMentions=this.mentionsOf('offer',o.id).map(c=>{
          const u=this.user(c.user);
          const src=c.kind==='asset'?(this.asset(c.itemId)||{}):(this.offer(c.itemId)||{});
          return {id:c.id,who:u.name.split(' ')[0],initials:u.initials,text:c.text,ago:c.ago,
            where:(src.name||'somewhere else'),
            click:()=>{ if(c.kind==='asset') this.openAsset(c.itemId); else this.go('offer',c.itemId); }};
        });
        V.ofHasMentions=V.ofMentions.length>0;
        V.ofMentionLabel=V.ofMentions.length+(V.ofMentions.length===1?' mention elsewhere':' mentions elsewhere');
        V.ofThreadLabel=V.ofThreadCount?(V.ofThreadCount+(V.ofThreadCount===1?' open note':' open notes')):'Nothing open';
        V.ofPost=()=>this.postComment('offer',o.id);
        V.ofSendReview=()=>this.open('sendReview',{kind:'offer',id:o.id});
        V.ofApprove=()=>this.approveItem('offer',o.id);
        V.ofReqChanges=()=>this.open('reqChanges',{kind:'offer',id:o.id,note:''});
        V.ofBrandName=b.name;
        const pc=this.cta(o.primaryCta), sc2=this.cta(o.secondaryCta);
        V.ofPrimary=pc?{text:pc.text,bg:pc.style==='outline'?'transparent':pc.bg,fg:pc.fg,bd:pc.style==='outline'?pc.fg:'transparent',url:pc.url}:null;
        V.ofHasPrimary=!!pc;
        V.ofSecondary=sc2?{text:sc2.text,bg:sc2.style==='outline'?'transparent':sc2.bg,fg:sc2.fg,bd:sc2.style==='outline'?sc2.fg:'transparent',url:sc2.url}:null;
        V.ofHasSecondary=!!sc2;
        V.ofNoCta=!pc&&!sc2;
        V.ofAssets=la.map(a=>this.assetCard(a));
        V.ofAssetsEmpty=la.length===0;
        V.ofAssetCount=la.length+(la.length===1?' asset supports this offer':' assets support this offer');
        V.ofLink=()=>this.open('link',{offerId:o.id});
        V.ofNewAsset=()=>this.open('asset',{brandId:o.brandId,status:'Draft',owner:'pr',_offers:[o.id]},0);
        V.ofEdit=()=>this.open('offer',Object.assign({},o));
        V.ofDelete=()=>this.open('confirm',{kind:'offer',id:o.id,label:o.name,back:{view:'brand',id:o.brandId,tab:'offers'}});
        V.ofArchived=!!o.archived;
        V.ofArchLabel=o.archived?'Restore':'Archive';
        V.ofArchive=()=>this.setArchived('offer',o.id,!o.archived);
        V.ofArchNote='Archived. Its assets are still in the library — only this room is closed.';
        V.ofStatic=!this.can('edit');
        V.ofStatChip={label:o.status,bg:this.hexA(this.OSTAT()[o.status]||'#9AA6A0',0.16),fg:this.OSTAT()[o.status]||'#9AA6A0'};
        V.ofStatusOptions=Object.keys(this.OSTAT()).map(k=>({label:k,active:o.status===k,bg:o.status===k?this.hexA(this.OSTAT()[k],0.16):'#FFFFFF',fg:o.status===k?this.OSTAT()[k]:'#7C8A83',bd:o.status===k?this.hexA(this.OSTAT()[k],0.4):'var(--bos-border)',click:()=>this.setStatus('offer',o.id,k)}));
        /* link-then-clone nudge */
        const n=s.nudge;
        V.hasNudge=!!(n&&n.offerId===o.id);
        if(V.hasNudge){
          const na=this.asset(n.assetId);
          V.nudgeText=(na?na.name:'That asset')+' is now linked to this offer. The same asset, not a copy.';
          V.nudgeClone=()=>this.open('clone',{srcId:n.assetId,brandId:na?na.brandId:o.brandId,name:(na?na.name:'')+' — '+o.name,_offers:[o.id],keepFiles:true,keepCopy:true});
          V.nudgeDismiss=()=>this.setState({nudge:null});
        }
      }
    }

    /* ---- global library ---- */
    if(s.view==='library'){
      const g=db.assets.filter(a=>!a.brandId);
      const tabs=['All','Checklist','Prompt','Template','SOP'];
      V.libTabs=tabs.map(t=>({label:t==='All'?'All':(t==='SOP'?'SOPs':t+'s'),active:s.libTab===t,bg:s.libTab===t?'#101614':'#FFFFFF',fg:s.libTab===t?'#FFFFFF':'#5C6B64',bd:s.libTab===t?'#101614':'var(--bos-border)',click:()=>this.setState({libTab:t})}));
      const lq=(s.libQ||'').toLowerCase();
      const fl=g.filter(a=>(s.libTab==='All'||a.type===s.libTab)&&(!lq||(a.name+' '+a.short+' '+(a.tags||[]).join(' ')).toLowerCase().indexOf(lq)>=0));
      V.libCards=this.expander(V,'lib',fl,a=>this.assetCard(a),'item').map(a=>this.assetCard(a));
      V.libEmpty=fl.length===0;
      V.libQ=s.libQ; V.onLibQ=e=>this.setState({libQ:e.target.value});
      V.libCount=this.live(g).length+' shared items';
      V.libUpload=()=>this.open('asset',{brandId:null,status:'Live',review:'Approved',owner:this.meId(),type:'SOP',_offers:[]},3);
    }

    /* ---- asset drawer ---- */
    V.drawerOpen=!!s.drawer;
    if(s.drawer){
      const a=this.asset(s.drawer);
      if(a){
        const b=a.brandId?this.brand(a.brandId):null;
        const ofs=this.linkedOffers(a.id);
        const col=b?b.primary:'#6C7B74';
        V.d={name:a.name,short:a.short,type:a.type,status:a.status,version:'v'+(a.version||1),
          code:this.codeOf(a),tileBg:this.hexA(col,0.12),tileFg:col,
          brandName:b?b.name:'Global Library',owner:this.user(a.owner).name,ago:a.ago,
          channel:a.channel||'Owned',chanBg:this.hexA(this.CHANCOL()[a.channel||'Owned']||'#5C6B64',0.13),chanFg:this.CHANCOL()[a.channel||'Owned']||'#5C6B64',
          url:a.url,notes:a.notes,specs:a.specs,audienceNotes:a.audienceNotes,aiPrompt:a.aiPrompt,
          statBg:this.hexA(this.ASTAT()[a.status]||'#9AA6A0',0.14),statFg:this.ASTAT()[a.status]||'#9AA6A0',
          category:this.catOf(a)==='campaign'?'Campaign asset':(this.catOf(a)==='master'?'Master file':'Global asset'),
          clientVisible:a.clientVisible?'Visible to client':'Internal only',
          clonedFrom:a.clonedFrom?(this.asset(a.clonedFrom)||{}).name:''};
        V.dHasClonedFrom=!!a.clonedFrom;
        V.dHasUrl=!!a.url; V.dHasNotes=!!a.notes; V.dHasSpecs=!!a.specs;
        V.dHasAudience=!!a.audienceNotes; V.dHasPrompt=!!a.aiPrompt;
        V.dTags=a.tags||[];
        V.dHasTags=(a.tags||[]).length>0;
        V.dOffers=ofs.map(o=>({id:o.id,name:o.name,segment:o.segment,segBg:this.hexA(this.AUD()[o.segment]||'#6B7280',0.13),segFg:this.AUD()[o.segment]||'#6B7280',click:()=>this.go('offer',o.id),unlink:()=>this.toggleLink(a.id,o.id,false)}));
        V.dNoOffers=ofs.length===0;
        V.dOfferCount=ofs.length===0?'Not linked to any offer':('Linked to '+ofs.length+' offer'+(ofs.length>1?'s':''));
        V.dCopy=a.copy||{headline:'',body:'',cta:''};
        V.dHasCopy=!!(a.copy&&(a.copy.headline||a.copy.body));
        V.dNoCopy=!V.dHasCopy;
        V.dFiles=(a.files||[]).map(f=>({name:f.name,size:f.size,label:(s.dl||{})[a.id+f.name]||'Download',click:()=>this.markDl(a.id+f.name)}));
        V.dNoFiles=(a.files||[]).length===0;
        V.dHistory=db.activity.filter(x=>x.type==='asset'&&x.id===a.id).map(x=>{const u=this.user(x.user);return {id:x.id,text:u.name.split(' ')[0]+' '+x.action+(x.field?(' — '+x.field):''),ago:x.ago,initials:u.initials};});
        V.dNoHistory=V.dHistory.length===0;
        const extra=a.type==='Checklist'?[['list','Checklist · '+this.doneCount(a)+'/'+this.items(a).length]]:(a.type==='Prompt'?[['prompt','Prompt']]:[]);
        V.dTabs=[['overview','Overview']].concat(extra).concat([['copy','Copy'],['files','Files · '+(a.files||[]).length],['discussion','Discussion · '+this.openCount('asset',a.id)],['history','History'],['sharing','Client']]).map(t=>({key:t[0],label:t[1],
          bg:s.drawerTab===t[0]?'#FFFFFF':'transparent',fg:s.drawerTab===t[0]?'#101614':'#6E7C76',
          bd:s.drawerTab===t[0]?'var(--bos-accent)':'transparent',weight:s.drawerTab===t[0]?'600':'500',
          click:()=>this.setState({drawerTab:t[0]})}));
        V.dtOverview=s.drawerTab==='overview'; V.dtCopy=s.drawerTab==='copy';
        V.dtFiles=s.drawerTab==='files'; V.dtHistory=s.drawerTab==='history'; V.dtSharing=s.drawerTab==='sharing'; V.dtDiscussion=s.drawerTab==='discussion';
        V.dtList=s.drawerTab==='list'&&a.type==='Checklist'; V.dtPrompt=s.drawerTab==='prompt'&&a.type==='Prompt';
        const its=this.items(a), dn=this.doneCount(a);
        V.dItems=its.map((it,idx)=>({text:it.text,done:it.done,
          box:it.done?'var(--bos-accent)':'#FFFFFF',bd:it.done?'var(--bos-accent)':'#AFBDB7',
          tick:it.done?'✓':'',num:String(idx+1).length<2?('0'+(idx+1)):String(idx+1),
          fg:it.done?'#7A8781':'#2A3833',line:it.done?'line-through':'none',
          click:()=>this.toggleItem(a.id,idx),
          remove:()=>this.removeItem(a.id,idx)}));
        V.dListCount=dn+' of '+its.length+' done';
        V.dListPct=its.length?(Math.round(dn/its.length*100)+'%'):'0%';
        V.dListDone=its.length>0&&dn===its.length;
        V.dListEmpty=its.length===0;
        V.dListStatic=!this.can('comment');
        V.dListHint=this.can('edit')
          ? 'This is the master copy. Clone it into a brand when you run it on a real project, so the ticks belong to that job and this one stays clean.'
          : 'This is the master copy. The ticks show where the team last left it — ask an editor if something needs changing.';
        V.dReset=()=>this.resetList(a.id);
        V.dAddItem=()=>this.addItem(a.id);
        V.itemText=s.itemText;
        V.onItemText=e=>this.setState({itemText:e.target.value});
        V.dPrompt=a.prompt||'';
        V.dPromptFor=a.promptFor||'';
        V.dPromptEmpty=!a.prompt;
        V.dCopyPrompt=()=>this.copyText(a.prompt,'pr-'+a.id);
        V.dCopyPromptLabel=(s.dl||{})['pr-'+a.id]||'Copy prompt';
        V.dPromptHint=this.can('edit')
          ? 'Square brackets are the bits you swap per job. This is the finalised version — if you improve it, edit it here rather than keeping a better one in your notes.'
          : 'Square brackets are the bits you swap per job. Copy it and fill them in — this is the finalised version the team agreed on.';
        V.dClose=()=>this.setState({drawer:null});
        V.dEdit=()=>this.open('asset',Object.assign({},a,{_offers:ofs.map(o=>o.id),copy:a.copy||{headline:'',body:'',cta:''}}),3);
        V.dClone=()=>this.open('clone',{srcId:a.id,brandId:a.brandId,name:a.name+' (copy)',_offers:[],keepFiles:true,keepCopy:true});
        V.dDelete=()=>this.open('confirm',{kind:'asset',id:a.id,label:a.name});
        V.dArchived=!!a.archived;
        V.dArchLabel=a.archived?'Restore':'Archive';
        V.dArchive=()=>this.setArchived('asset',a.id,!a.archived);
        V.dArchNote='Archived. Offers that link to it still show it, greyed out.';
        V.dCopyAll=()=>{ try{ navigator.clipboard.writeText([V.dCopy.headline,V.dCopy.body,V.dCopy.cta].filter(Boolean).join('\n\n')); }catch(e){} };
        V.dLinkMore=()=>this.open('linkAsset',{assetId:a.id});
        V.dStatic=!this.can('edit');
        V.dStatChip={label:a.status,bg:this.hexA(this.ASTAT()[a.status]||'#9AA6A0',0.16),fg:this.ASTAT()[a.status]||'#9AA6A0'};
        V.dStatusOptions=Object.keys(this.ASTAT()).map(k=>({label:k,active:a.status===k,bg:a.status===k?this.hexA(this.ASTAT()[k],0.16):'#FFFFFF',fg:a.status===k?this.ASTAT()[k]:'#7C8A83',bd:a.status===k?this.hexA(this.ASTAT()[k],0.4):'var(--bos-border)',click:()=>this.setStatus('asset',a.id,k)}));
        V.dVisibleToggle=()=>this.commit(db2=>{const i=db2.assets.findIndex(x=>x.id===a.id); if(i>=0){db2.assets[i].clientVisible=!db2.assets[i].clientVisible;}},'edit');
        V.dIsVisible=!!a.clientVisible;
        const aw=this.waitOn('asset',a);
        V.dWaiting=!!aw;
        V.dWaitText=aw?(aw.verb+' — '+this.user(aw.who).name+(aw.who===this.meId()?' (you)':'')):'';
        V.dWaitBg=aw?this.hexA(aw.act==='review'?'#C99A2E':'#C2410C',0.10):'transparent';
        V.dWaitBd=aw?this.hexA(aw.act==='review'?'#C99A2E':'#C2410C',0.35):'transparent';
        V.dNote=a.changeNote||'';
        V.dHasNote=!!a.changeNote;
        V.dSendReview=()=>this.open('sendReview',{kind:'asset',id:a.id});
        V.dApprove=()=>this.approveItem('asset',a.id);
        V.dReqChanges=()=>this.open('reqChanges',{kind:'asset',id:a.id,note:''});
        V.dThread=this.thread('asset',a.id);
        V.dThreadEmpty=V.dThread.length===0;
        V.dPost=()=>this.postComment('asset',a.id);
        V.dCmtCount=String(this.openCount('asset',a.id));
        V.dReviewLabel=(!a.review||a.review==='None')?'Not reviewed':a.review;
        V.dRevBg=this.hexA(this.REVCOL()[a.review||'None'],0.15);
        V.dRevFg=this.REVCOL()[a.review||'None']||'#93A09A';
        V.dFileCount=(a.files||[]).length;
        V.dDownloadAll=()=>this.markDl('all-'+a.id);
        V.dAllLabel=(s.dl||{})['all-'+a.id]||('Download all ('+V.dFileCount+')');
        V.dGated=a.gated?'Gated — requested, then sent':'Open';
        V.dDelivery=a.delivery||'None';
      }
    }

    /* ---- command palette ---- */
    V.cmtText=s.cmtText;
    V.onCmt=e=>this.setState({cmtText:e.target.value});
    const sg=this.suggestions();
    V.sugOpen=!!(sg&&sg.rows.length);
    V.sugKind=sg?(sg.tk.sign==='#'?'Offers':'People'):'';
    V.sugRows=sg?sg.rows.map(r=>({id:r.sign+r.id,label:(r.sign==='#'?'#':'@')+r.label,sub:r.sub,
      click:()=>this.pickToken(r,sg.tk)})):[];
    V.cmtPlaceholder='Add a note. Type # to tag an offer, @ to pull someone in';
    V.cmdkOpen=s.cmdk; V.q=s.q; V.onQ=e=>this.setState({q:e.target.value});
    if(s.cmdk){
      const all=this.search(s.q);
      const scopes=['All','Client','Brand','Service','Offer','Asset','CTA'];
      V.cmdkScopes=scopes.map(k=>({label:k==='All'?'Everything':(k+'s'),active:s.cmdkScope===k,bg:s.cmdkScope===k?'#101614':'transparent',fg:s.cmdkScope===k?'#FFFFFF':'#7C8A83',click:()=>this.setState({cmdkScope:k})}));
      const filtered=all.filter(r=>s.cmdkScope==='All'||r.kind===s.cmdkScope);
      V.cmdkResults=filtered.slice(0,10).map(r=>({
        id:r.kind+r.id,title:r.title,sub:r.sub,kind:r.kind,code:r.code,
        tileBg:this.hexA(r.color,0.12),tileFg:r.color,
        click:()=>{ if(r.kind==='Asset') this.openAsset(r.id);
          else if(r.kind==='Service') this.go('service',r.id);
          else if(r.kind==='Offer') this.go('offer',r.id);
          else if(r.kind==='Brand') this.go('brand',r.id,'home');
          else if(r.kind==='Client') this.go('client',r.id);
          else { const c=this.cta(r.id); if(c) this.go('brand',c.brandId,'ctas'); this.setState({cmdk:false}); } }
      }));
      V.cmdkNoResults=(s.q||'').trim().length>0&&filtered.length===0;
      V.cmdkIdle=(s.q||'').trim().length===0;
      V.cmdkCount=filtered.length?(filtered.length+' result'+(filtered.length>1?'s':'')):'';
      V.cmdkRecent=(db.recents||[]).filter(r=>{
        if(r.k==='brand') return this.seesBrand(r.id);
        if(r.k==='offer'){ const o=this.offer(r.id); return o&&this.seesBrand(o.brandId); }
        if(r.k==='service'){ const v=this.service(r.id); return v&&this.seesBrand(v.brandId); }
        const a=this.asset(r.id); return a&&(!a.brandId||this.seesBrand(a.brandId));
      }).map(r=>{
        if(r.k==='brand'){ const b=this.brand(r.id); return b?{id:r.id,title:b.name,sub:'Brand',code:b.mark,tileBg:this.hexA(b.primary,0.12),tileFg:b.primary,click:()=>this.go('brand',b.id,'home')}:null; }
        if(r.k==='offer'){ const o=this.offer(r.id); if(!o) return null; const b=this.brand(o.brandId)||{}; return {id:r.id,title:o.name,sub:'Offer · '+b.name,code:'OF',tileBg:this.hexA(b.primary||'#6C7B74',0.12),tileFg:b.primary||'#6C7B74',click:()=>this.go('offer',o.id)}; }
        const a=this.asset(r.id); if(!a) return null; const b2=a.brandId?this.brand(a.brandId):null;
        return {id:r.id,title:a.name,sub:'Asset · '+(b2?b2.name:'Global'),code:this.codeOf(a),tileBg:this.hexA(b2?b2.primary:'#6C7B74',0.12),tileFg:b2?b2.primary:'#6C7B74',click:()=>this.openAsset(a.id)};
      }).filter(Boolean);
      V.cmdkClose=()=>this.setState({cmdk:false});
    }

    /* ---- modals ---- */
    V.modalOpen=!!s.modal;
    V.mNew=s.modal==='new'; V.mOffer=s.modal==='offer'; V.mAsset=s.modal==='asset';
    V.mClone=s.modal==='clone'; V.mLink=s.modal==='link'; V.mLinkAsset=s.modal==='linkAsset';
    V.mCta=s.modal==='cta'; V.mConfirm=s.modal==='confirm'; V.mClient=s.modal==='client'; V.mBrand=s.modal==='brand';
    V.mService=s.modal==='service'; V.mAngle=s.modal==='angle';
    V.mSendReview=s.modal==='sendReview'; V.mReqChanges=s.modal==='reqChanges';
    V.mGoal=s.modal==='goal'; V.mMergeGoal=s.modal==='mergeGoal'; V.mGoalOffers=s.modal==='goalOffers';
    V.mPerson=s.modal==='person';
    if(V.mPerson){
      V.pTitle=s.draft.id?'Edit access':'Invite someone';
      V.pSave=()=>this.savePerson();
      V.pIsNew=!s.draft.id;
      V.accessChoices=this.ACCESS().map(a=>({name:a,note:this.ACCNOTE()[a],
        bg:s.draft.access===a?'var(--bos-soft)':'#FFFFFF',
        bd:s.draft.access===a?'var(--bos-accent)':'var(--bos-border)',
        dot:this.ACCCOL()[a],
        click:()=>this.setState(x=>({draft:Object.assign({},x.draft,{access:a})}))}));
      V.allOn=!!s.draft.all;
      V.allBox=s.draft.all?'var(--bos-accent)':'#FFFFFF';
      V.allBd=s.draft.all?'var(--bos-accent)':'#AFBDB7';
      V.allTick=s.draft.all?'✓':'';
      V.toggleAll=()=>this.setState(x=>({draft:Object.assign({},x.draft,{all:!x.draft.all,clients:[],brands:[],groups:[]})}));
      V.pGroups=(db.groups||[]).map(g=>{
        const on=(s.draft.groups||[]).indexOf(g.id)>=0;
        return {name:g.name,sub:(g.clients||[]).length+' clients',
          bg:on?'var(--bos-soft)':'#FFFFFF',bd:on?'var(--bos-accent)':'var(--bos-border)',
          click:()=>this.toggleIn('groups',g.id)};
      });
      V.pClients=this.live(db.clients).map(c=>{
        const on=(s.draft.clients||[]).indexOf(c.id)>=0;
        return {name:c.name,bg:on?'var(--bos-soft)':'#FFFFFF',bd:on?'var(--bos-accent)':'var(--bos-border)',
          click:()=>this.toggleIn('clients',c.id)};
      });
      V.pScopeDim=s.draft.all?'.4':'1';
      V.pRoleOptions=['Strategy lead','Client lead','Design','Copy and content','Paid media','Account director','Team member'];
    }
    V.closeModal=()=>this.setState({modal:null,draft:{},step:0});
    V.draft=s.draft;
    V.on={};
    ['name','short','positioning','angle','promise','proof','audience','status','type','brandId','clientId','parentId','url','notes','specs','audienceNotes','aiPrompt','text','bg','fg','style','ctaId','primaryCta','secondaryCta','kind','tagline','primary','secondary','mark','description','voice','boilerplate','owner','note','since','serviceId','segment','channel','offerType','delivery','note','access','role'].forEach(k=>{ V.on[k]=this.field(k); });
    V.onCopy={headline:this.copyField('headline'),body:this.copyField('body'),cta:this.copyField('cta')};
    V.draftCopy=s.draft.copy||{headline:'',body:'',cta:''};

    V.segOptions=Object.keys(this.AUD());
    V.oStatOptions=Object.keys(this.OSTAT());
    V.aStatOptions=Object.keys(this.ASTAT());
    V.brandOptions=db.brands.map(b=>({id:b.id,name:b.name+(b.parentId?(' (sub-brand of '+(this.brand(b.parentId)||{}).name+')'):'')}));
    V.clientOptions=db.clients.map(c=>({id:c.id,name:c.name}));

    if(V.mNew){
      V.newOptions=[
        {label:'A landing page, email or ad',sub:'A campaign asset that supports an offer',click:()=>this.open('asset',{brandId:(ab||db.brands[0]).id,status:'Draft',owner:'pr',_offers:[]},0)},
        {label:'An offer',sub:'Positioning, angle, promise and proof',click:()=>this.open('offer',{brandId:(ab||db.brands[0]).id,segment:'All segments',angles:[],serviceId:'',status:'Ideation',owner:'pr',primaryCta:'',secondaryCta:''})},
        {label:'A service',sub:'A capability you sell, positioned per segment',click:()=>this.open('service',{brandId:(ab||db.brands[0]).id})},
        {label:'An angle',sub:'A reusable argument offers can carry',click:()=>this.open('angle',{brandId:(ab||db.brands[0]).id})},
        {label:'A checklist or prompt',sub:'Reusable process, kept in the Global Library',click:()=>this.open('asset',{brandId:null,type:'Checklist',status:'Live',review:'Approved',owner:this.meId(),items:[],_offers:[]},3)},
        {label:'A CTA',sub:'Reusable button with real colours',click:()=>{const b=ab||db.brands[0]; this.open('cta',{brandId:b.id,bg:b.primary,fg:this.onColor(b.primary),style:'solid',text:'',url:''});}},
        {label:'A brand',sub:'A new building under a client',click:()=>this.open('brand',{clientId:(ab?ab.clientId:db.clients[0].id)})},
        {label:'A client',sub:'A new property on the street',click:()=>this.open('client',{})}
      ];
    }

    if(V.mOffer){
      V.mOfferTitle=s.draft.id?'Edit offer':'New offer';
      V.mOfferSub=s.draft.id?'':'Positioning first. You can pull existing assets in once the room exists.';
      V.mOfferBrandName=(this.brand(s.draft.brandId)||{}).name||'';
      V.mOfferSave=()=>this.saveOffer();
      V.mOfferValid=!!(s.draft.name&&s.draft.name.trim());
      V.mOfferSaveBg=V.mOfferValid?'var(--bos-accent)':'#AFBDB7';
      V.shortCount=(s.draft.short||'').length+'/30';
      V.shortOver=(s.draft.short||'').length>30;
      V.shortCountColor=(s.draft.short||'').length>30?'#C2410C':'#84918B';
      V.ctaOptions=[{id:'',name:'None'}].concat(db.ctas.filter(c=>c.brandId===s.draft.brandId).map(c=>({id:c.id,name:c.text})));
      const mb=this.brand(s.draft.brandId)||{};
      V.segOptions=(mb.segments||[]).map(x=>x.name);
      V.serviceOptions=[{id:'',name:'Standalone — sits above every service'}].concat(this.servicesOf(s.draft.brandId).map(x=>({id:x.id,name:x.name})));
      V.angleRows=this.goalNamesOf(s.draft.brandId).map(g=>{
        const on=(s.draft.goals||[]).indexOf(g)>=0;
        return {id:g,name:g,description:'',
          bg:on?'var(--bos-soft)':'#FFFFFF',bd:on?'var(--bos-accent)':'var(--bos-border)',
          fg:on?'var(--bos-accent)':'#5C6B64',
          click:()=>this.toggleDraftGoal(g)};
      });
      V.angleRowsEmpty=V.angleRows.length===0;
      V.typeChoiceOptions=this.OTYPES();
    }

    if(V.mAsset){
      const st=s.step||0;
      V.step0=st===0; V.step1=st===1; V.step2=st===2; V.step3=st===3;
      V.mAssetTitle=s.draft.id?'Edit asset':'What are you making?';
      const known=!!(s.draft.brandId&&(s.draft._offers||[]).length)&&!s.draft.id;
      V.stepLabel=s.draft.id?'':(known?'One step — the rest is already known':('Step '+(st+1)+' of 4'));
      V.ctxKnown=known&&st===0;
      V.ctxLine=known?((this.brand(s.draft.brandId)||{}).name+' · '+((this.offer((s.draft._offers||[])[0])||{}).name||'')):'';
      V.typeChoices=Object.keys(this.TYPES()).map(k=>({label:k,code:this.TYPES()[k].code,cat:this.TYPES()[k].cat,
        active:s.draft.type===k,bg:s.draft.type===k?'var(--bos-soft)':'#FFFFFF',bd:s.draft.type===k?'var(--bos-accent)':'var(--bos-border)',
        click:()=>this.setState(st2=>({draft:Object.assign({},st2.draft,{type:k}),step:(st2.draft.brandId&&(st2.draft._offers||[]).length)?3:1}))}));
      V.brandChoices=db.brands.map(b=>({id:b.id,name:b.name,mark:b.mark,tagline:b.tagline,primary:b.primary,tileBg:this.hexA(b.primary,0.12),
        active:s.draft.brandId===b.id,bd:s.draft.brandId===b.id?b.primary:'var(--bos-border)',
        sub:b.parentId?('Sub-brand of '+(this.brand(b.parentId)||{}).name):((this.client(b.clientId)||{}).name||''),
        click:()=>this.setState(st2=>({draft:Object.assign({},st2.draft,{brandId:b.id}),step:2}))}));
      V.globalChoice=()=>this.setState(st2=>({draft:Object.assign({},st2.draft,{brandId:null}),step:3}));
      V.draftOfferRows=this.offersOf(s.draft.brandId).map(o=>({
        id:o.id,name:o.name,segment:o.segment,checked:(s.draft._offers||[]).indexOf(o.id)>=0,
        box:(s.draft._offers||[]).indexOf(o.id)>=0?'var(--bos-accent)':'#FFFFFF',
        bd:(s.draft._offers||[]).indexOf(o.id)>=0?'var(--bos-accent)':'#AFBDB7',
        tick:(s.draft._offers||[]).indexOf(o.id)>=0?'✓':'',
        click:()=>this.toggleDraftOffer(o.id)}));
      V.draftOfferEmpty=V.draftOfferRows.length===0;
      V.pickedCount=(s.draft._offers||[]).length;
      V.pickedLabel=(s.draft._offers||[]).length?((s.draft._offers||[]).length+' offer'+((s.draft._offers||[]).length>1?'s':'')+' selected'):'No offers selected — it will sit in the library unlinked';
      V.stepBack=()=>this.setState(st2=>({step:Math.max(0,(st2.step||0)-1)}));
      V.stepNext=()=>this.setState(st2=>({step:Math.min(3,(st2.step||0)+1)}));
      V.mAssetSave=()=>this.saveAsset();
      V.mAssetValid=!!(s.draft.name&&s.draft.name.trim()&&s.draft.type);
      V.mAssetSaveBg=V.mAssetValid?'var(--bos-accent)':'#AFBDB7';
      V.mAssetTypeName=s.draft.type||'';
      V.mAssetBrandName=s.draft.brandId?((this.brand(s.draft.brandId)||{}).name||''):'Global Library';
      const nm=(s.draft.name||'').toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>3);
      const dupes=nm.length?db.assets.filter(a=>a.id!==s.draft.id&&nm.some(w=>a.name.toLowerCase().indexOf(w)>=0)).slice(0,3):[];
      V.dupes=dupes.map(a=>{const b=a.brandId?this.brand(a.brandId):null;return {id:a.id,name:a.name,sub:(b?b.name:'Global')+' · '+a.type,click:()=>{this.setState({modal:null,draft:{},step:0}); setTimeout(()=>this.openAsset(a.id),0);}};});
      V.hasDupes=dupes.length>0;
      V.assetCtaOptions=[{id:'',name:'None'}].concat(db.ctas.filter(c=>c.brandId===s.draft.brandId).map(c=>({id:c.id,name:c.text})));
      V.typeOptions=Object.keys(this.TYPES());
      V.channelOptions=this.CHANNELS();
      V.deliveryOptions=this.DELIVERY();
      V.draftGated=!!s.draft.gated;
      V.gatedBox=s.draft.gated?'var(--bos-accent)':'#FFFFFF';
      V.gatedBd=s.draft.gated?'var(--bos-accent)':'#AFBDB7';
      V.gatedTick=s.draft.gated?'✓':'';
      V.toggleGated=()=>this.setState(x=>({draft:Object.assign({},x.draft,{gated:!x.draft.gated})}));
    }

    if(V.mClone){
      const src=this.asset(s.draft.srcId)||{};
      V.cloneSrcName=src.name||'';
      V.cloneOfferRows=this.offersOf(s.draft.brandId).map(o=>({id:o.id,name:o.name,segment:o.segment,
        checked:(s.draft._offers||[]).indexOf(o.id)>=0,
        box:(s.draft._offers||[]).indexOf(o.id)>=0?'var(--bos-accent)':'#FFFFFF',
        bd:(s.draft._offers||[]).indexOf(o.id)>=0?'var(--bos-accent)':'#AFBDB7',
        tick:(s.draft._offers||[]).indexOf(o.id)>=0?'✓':'',
        click:()=>this.toggleDraftOffer(o.id)}));
      V.keepFiles=s.draft.keepFiles!==false; V.keepCopy=s.draft.keepCopy!==false;
      V.keepFilesBox=V.keepFiles?'var(--bos-accent)':'#FFFFFF'; V.keepFilesBd=V.keepFiles?'var(--bos-accent)':'#AFBDB7'; V.keepFilesTick=V.keepFiles?'✓':'';
      V.keepCopyBox=V.keepCopy?'var(--bos-accent)':'#FFFFFF'; V.keepCopyBd=V.keepCopy?'var(--bos-accent)':'#AFBDB7'; V.keepCopyTick=V.keepCopy?'✓':'';
      V.toggleKeepFiles=()=>this.setState(st=>({draft:Object.assign({},st.draft,{keepFiles:st.draft.keepFiles===false})}));
      V.toggleKeepCopy=()=>this.setState(st=>({draft:Object.assign({},st.draft,{keepCopy:st.draft.keepCopy===false})}));
      V.mCloneSave=()=>this.cloneAsset();
    }

    if(V.mLink){
      const oid=s.draft.offerId; const o=this.offer(oid)||{};
      const linked=this.linkedAssetIds(oid);
      const pool=db.assets.filter(a=>(a.brandId===o.brandId||!a.brandId)&&this.catOf(a)!=='master');
      const pq=(s.pickQ||'').toLowerCase();
      const scoped=pool.filter(a=>{
        if(s.pickScope==='unlinked'&&linked.indexOf(a.id)>=0) return false;
        if(s.pickScope==='linked'&&linked.indexOf(a.id)<0) return false;
        return !pq||(a.name+' '+a.short+' '+a.type+' '+(a.tags||[]).join(' ')).toLowerCase().indexOf(pq)>=0;
      });
      V.linkOfferName=o.name;
      V.pickQ=s.pickQ; V.onPickQ=e=>this.setState({pickQ:e.target.value});
      V.pickScopes=[['unlinked','Not yet linked'],['linked','Already linked'],['all','Everything']].map(k=>({label:k[1],active:s.pickScope===k[0],bg:s.pickScope===k[0]?'#101614':'#FFFFFF',fg:s.pickScope===k[0]?'#FFFFFF':'#5C6B64',bd:s.pickScope===k[0]?'#101614':'var(--bos-border)',click:()=>this.setState({pickScope:k[0]})}));
      V.pickRows=scoped.slice(0,40).map(a=>{
        const on=linked.indexOf(a.id)>=0; const b=a.brandId?this.brand(a.brandId):null;
        const other=this.linkedOffers(a.id).length;
        return {id:a.id,name:a.name,code:this.codeOf(a),
          tileBg:this.hexA(b?b.primary:'#6C7B74',0.12),tileFg:b?b.primary:'#6C7B74',
          sub:a.type+' · '+(other?('already in '+other+' offer'+(other>1?'s':'')):'not linked anywhere'),
          actionLabel:on?'Unlink':'Link',
          actionBg:on?'#FFFFFF':'var(--bos-accent)',actionFg:on?'#7C8A83':'var(--bos-on)',
          actionBd:on?'var(--bos-border)':'var(--bos-accent)',
          click:()=>{ this.toggleLink(a.id,oid,!on); if(!on) this.setState({modal:null}); }};
      });
      V.pickEmpty=scoped.length===0;
      V.pickHint='Linking does not copy anything. The asset stays where it is and gains one more room.';
    }

    if(V.mLinkAsset){
      const aid=s.draft.assetId; const a=this.asset(aid)||{};
      const linked=this.db.links.filter(l=>l.assetId===aid).map(l=>l.offerId);
      const pool=this.offersOf(a.brandId);
      V.linkAssetName=a.name;
      V.linkOfferRows=pool.map(o=>{
        const on=linked.indexOf(o.id)>=0;
        return {id:o.id,name:o.name,segment:o.segment,
          segBg:this.hexA(this.AUD()[o.segment]||'#6B7280',0.13),segFg:this.AUD()[o.segment]||'#6B7280',
          actionLabel:on?'Linked':'Link',
          actionBg:on?'var(--bos-soft)':'#FFFFFF',actionFg:on?'var(--bos-accent)':'#5C6B64',
          actionBd:on?'var(--bos-accent)':'var(--bos-border)',
          click:()=>this.toggleLink(aid,o.id,false)};
      });
      V.linkOfferEmpty=pool.length===0;
    }

    if(V.mCta){
      V.mCtaTitle=s.draft.id?'Edit CTA':'New CTA';
      V.mCtaSave=()=>this.saveCta();
      V.ctaPreview={text:s.draft.text||'Button text',bg:s.draft.style==='outline'?'transparent':(s.draft.bg||'#2D4A5C'),fg:s.draft.fg||'#FFFFFF',bd:s.draft.style==='outline'?(s.draft.fg||'#2D4A5C'):'transparent'};
      V.styleOptions=['solid','outline','ghost'];
      const bb=this.brand(s.draft.brandId)||{};
      V.ctaSwatches=[bb.primary,bb.secondary,'#101614','#FFFFFF'].filter(Boolean).map(hx=>({hex:hx,click:()=>this.setState(st=>({draft:Object.assign({},st.draft,{bg:hx,fg:this.onColor(hx)})}))}));
    }

    if(V.mService){ V.mServiceTitle=s.draft.id?'Edit service':'New service'; V.mServiceSave=()=>this.saveService(); V.mServiceBrand=(this.brand(s.draft.brandId)||{}).name||''; }
    if(V.mAngle){ V.mAngleTitle=s.draft.id?'Edit angle':'New angle'; V.mAngleSave=()=>this.saveAngle(); V.mAngleBrand=(this.brand(s.draft.brandId)||{}).name||''; }
    if(V.mGoal){
      V.mGoalTitle=s.draft.original?'Edit goal':'New goal';
      V.mGoalSave=()=>this.saveGoal();
      V.mGoalIsEdit=!!s.draft.original;
      V.mGoalDelete=()=>this.deleteGoal(s.draft.brandId,s.draft.original);
      V.mGoalBrand=(this.brand(s.draft.brandId)||{}).name||'';
    }
    if(V.mMergeGoal){
      V.mgFrom=s.draft.from;
      V.mgRows=this.goalNamesOf(s.draft.brandId).filter(n=>n!==s.draft.from).map(n=>({
        name:n,
        bg:s.draft.into===n?'var(--bos-soft)':'#FFFFFF',
        bd:s.draft.into===n?'var(--bos-accent)':'var(--bos-border)',
        click:()=>this.setState(x=>({draft:Object.assign({},x.draft,{into:n})}))}));
      const cnt=db.offers.filter(o=>o.brandId===s.draft.brandId&&(o.goals||[]).indexOf(s.draft.from)>=0).length;
      V.mgCount=cnt+(cnt===1?' offer moves across':' offers move across');
      V.mgReady=!!s.draft.into;
      V.mgBtnBg=s.draft.into?'var(--bos-accent)':'#AFBDB7';
      V.mgSave=()=>this.mergeGoal();
    }
    if(V.mGoalOffers){
      V.goName=s.draft.name;
      const list=db.offers.filter(o=>o.brandId===s.draft.brandId&&(o.goals||[]).indexOf(s.draft.name)>=0);
      V.goRows=list.map(o=>({id:o.id,name:o.name,
        sub:(o.serviceId?((this.service(o.serviceId)||{}).name||'Standalone'):'Standalone')+' · '+o.segment,
        status:o.status,statBg:this.hexA(this.OSTAT()[o.status]||'#9AA6A0',0.14),statFg:this.OSTAT()[o.status]||'#9AA6A0',
        click:()=>{ this.setState({modal:null,draft:{}}); setTimeout(()=>this.go('offer',o.id),0); }}));
      V.goEmpty=list.length===0;
      V.goCount=list.length+(list.length===1?' offer chases this':' offers chase this');
    }
    if(V.mSendReview){
      const k=s.draft.kind, item=k==='asset'?this.asset(s.draft.id):this.offer(s.draft.id);
      V.srName=item?item.name:'';
      V.srRows=db.users.filter(u=>u.id!==((item||{}).owner)).map(u=>({id:u.id,name:u.name,role:u.role,initials:u.initials,
        click:()=>this.sendForReview(k,s.draft.id,u.id)}));
    }
    if(V.mReqChanges){
      const k=s.draft.kind, item=k==='asset'?this.asset(s.draft.id):this.offer(s.draft.id);
      V.rcName=item?item.name:'';
      V.rcOwner=item?this.user(item.owner).name:'';
      V.rcSave=()=>this.requestChanges();
    }
    if(V.mClient){ V.mClientTitle=s.draft.id?'Edit client':'New client'; V.mClientSave=()=>this.saveClient(); }
    if(V.mBrand){
      V.mBrandTitle=s.draft.id?'Edit brand':'New brand';
      V.mBrandSave=()=>this.saveBrand();
      V.mBrandParentName=s.draft.parentId?((this.brand(s.draft.parentId)||{}).name||''):'';
      V.mBrandIsSub=!!s.draft.parentId;
      V.brandPreview={primary:s.draft.primary||'#2D4A5C',secondary:s.draft.secondary||'#7BA0A8',
        mark:(s.draft.mark||(s.draft.name||'?').slice(0,2)).toUpperCase(),
        fg:this.onColor(s.draft.primary||'#2D4A5C'),name:s.draft.name||'New brand',
        tint:this.hexA(s.draft.primary||'#2D4A5C',0.06)};
      V.palettes=[['#1F6F5C','#E8B44A'],['#4338CA','#06B6D4'],['#A3431F','#4D7C0F'],['#0E7490','#F97316'],['#2D4A5C','#7BA0A8']].map(p=>({a:p[0],b:p[1],click:()=>this.setState(st=>({draft:Object.assign({},st.draft,{primary:p[0],secondary:p[1]})}))}));
    }
    if(V.mConfirm){
      V.confirmLabel=s.draft.label||'';
      V.confirmKind=s.draft.kind||'';
      V.confirmBody=s.draft.kind==='asset'?'The asset is removed and every link to it disappears. The offers stay.':(s.draft.kind==='offer'?'The offer is removed. Its assets stay in the library — only the links go.':(s.draft.kind==='service'?'The service goes. Its offers survive and become standalone.':(s.draft.kind==='angle'?'The angle goes and is removed from every offer that carried it. The offers stay.':'Everything inside it goes too. This cannot be undone.')));
      V.confirmDo=()=>this.doDelete();
    }

    return V;
  }
  copyField(part){
    const k='_c_'+part;
    if(!this._on[k]) this._on[k]=e=>{ const v=e.target.value; this.setState(s=>{ const c=Object.assign({headline:'',body:'',cta:''},s.draft.copy||{}); c[part]=v; return {draft:Object.assign({},s.draft,{copy:c})}; }); };
    return this._on[k];
  }
}

</script>


<div id="__claude_design_branding">