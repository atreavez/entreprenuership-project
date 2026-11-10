const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require(require('node:child_process').execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()+'/typescript');
function transpile(file){const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(js,file);return m.exports}
const root=path.resolve(__dirname,'../../apps/api/src/contexts/geospatial');
const dom=transpile(path.join(root,'domain/parcel-boundary.ts'));
const mod=path.join(root,'application/parcel-usecases.ts');const js=ts.transpileModule(fs.readFileSync(mod,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};new Function('require','module','exports',js)((n)=>n==='../domain/parcel-boundary'?dom:n==='../domain/parcel-overlap'?transpile(path.join(root,'domain/parcel-overlap.ts')):require(n),m,m.exports);
const {ParcelUseCases}=m.exports;
const actor={id:'maker',organizationId:'org1',role:'CLIENT',professionalApproved:false};
const polygon={type:'Polygon',coordinates:[[[32.57,.31],[32.58,.31],[32.58,.32],[32.57,.32],[32.57,.31]]]};
function fake(){const calls=[];return {calls,list:async()=>[],create:async(...v)=>{calls.push(['create',...v]);return {ok:true}},submit:async(...v)=>{calls.push(['submit',...v])},review:async(...v)=>{calls.push(['review',...v])},search:async(...v)=>{calls.push(['search',...v]);return []}}}
test('create calls store only after validated geometry',async()=>{const r=fake(),u=new ParcelUseCases(r);await u.create(actor,'a1',{geometry:polygon,sourceKind:'FIELD_SURVEY',notes:'Field measured',sourceReference:'DOC-123'});assert.equal(r.calls[0][0],'create');assert.deepEqual(r.calls[0][3].geometry,polygon)});
test('create rejects malformed without ever persisting',async()=>{const r=fake(),u=new ParcelUseCases(r);assert.throws(()=>u.create(actor,'a1',{geometry:{type:'Point',coordinates:[32,0]},sourceKind:'CLIENT_SKETCH'}));assert.equal(r.calls.length,0)});
test('review rejects nonprofessional users before store call',async()=>{const r=fake(),u=new ParcelUseCases(r);assert.throws(()=>u.review(actor,'sid','a1','c1',{decision:'ACCEPTED',reviewNotes:'Looks fine'}),/surveyor/i);assert.equal(r.calls.length,0)});
test('review requires notes and correct decisions',async()=>{const r=fake(),u=new ParcelUseCases(r),prof={...actor,id:'reviewer',role:'SURVEYOR',professionalApproved:true};assert.throws(()=>u.review(prof,'sid','a1','c1',{decision:'ACCEPTED',reviewNotes:''}),/nonempty/i);assert.throws(()=>u.review(prof,'sid','a1','c1',{decision:'OTHER',reviewNotes:'A note'}),/decision/i);assert.equal(r.calls.length,0)});
test('search rejects excessive bboxes before querying',()=>{const r=fake(),u=new ParcelUseCases(r);assert.throws(()=>u.search(actor,'0,-2,10,2'),/cap/i);assert.equal(r.calls.length,0)});
test('search delegates parsed bounding box',async()=>{const r=fake(),u=new ParcelUseCases(r);await u.search(actor,'32.4,0.0,32.9,0.5');assert.deepEqual(r.calls[0][2],[32.4,0,32.9,0.5])});
