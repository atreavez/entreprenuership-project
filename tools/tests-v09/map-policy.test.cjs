const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=(()=>{try{return require('typescript')}catch{return require(require('child_process').execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()+'/typescript')}})();
const file=path.resolve(__dirname,'../../apps/web/src/map/domain/map-policy.ts');
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const sandboxModule={exports:{}};vm.runInNewContext(code,{module:sandboxModule,exports:sandboxModule.exports});const {localStylePath,claimFeatures,mapViewport}=sandboxModule.exports;
test('only same-origin /maps style path allowed',()=>{
 assert.equal(localStylePath('/maps/style.json'),'/maps/style.json');
 for(const path of ['https://vendor/maps/style.json','//evil.com/style.json','/maps/../api/v1/assets','/maps//style.json','/api/v1/docs','/maps/style.json?x=1','\\maps\\style.json']){
  assert.throws(()=>localStylePath(path),undefined,path);
 }
});
test('private GeoJSON contains no uploaded text or identity information',()=>{
 const result=claimFeatures([{id:'claim-a',status:'SUBMITTED',asset_code:'AT-DEMO-10',source_reference:'private-scan-123',notes:'BANK ACCOUNT SECRET',submitted_by:'user-id',geometry:{type:'Polygon',coordinates:[[[32,0.3],[32.02,0.3],[32.02,0.33],[32,0.3]]]}}]);
 assert.equal(result.type,'FeatureCollection');assert.equal(result.features.length,1);
 assert.equal(result.features[0].properties.claimId,'claim-a');
 for(const banned of ['BANK ACCOUNT SECRET','private-scan-123','user-id'])assert.ok(!JSON.stringify(result).includes(banned));
});
test('invalid or malformed geometries are omitted',()=>{
 const invalid=[{id:'a',geometry:{type:'Point',coordinates:[0,0]}},{id:'b',geometry:{type:'Polygon',coordinates:[[[0,0],[NaN,0],[0,0]]]}}];
 assert.equal(claimFeatures(invalid).features.length,0);
});
test('map requests remain bounded',()=>{
 assert.deepEqual(Array.from(mapViewport([32.2,0.1,33.1,0.6])),[32.2,0.1,33.1,0.6]);
 assert.throws(()=>mapViewport([32,-0.5,40,7]));
 assert.throws(()=>mapViewport([32,91,33,92]));
 assert.throws(()=>mapViewport([32,0.3,32,0.4]));
});
// Contract regression: externally hosted maps must never receive user viewport coordinates.
test('public map style rejects URL and unknown layers',()=>{
 const {assertLocalBasemapStyle}=sandboxModule.exports;
 const valid={version:8,sources:{basemap:{type:'raster',tiles:['/maps/tiles/{z}/{x}/{y}.png']}},layers:[{id:'bg',type:'background'},{id:'base',type:'raster',source:'basemap'}]};
 assert.doesNotThrow(()=>assertLocalBasemapStyle(valid));
 for(const mutated of [
  {...valid,sources:{basemap:{type:'raster',tiles:['https://external.test/{z}/{x}/{y}.png']}}},
  {...valid,glyphs:'https://external.test/fonts/{fontstack}/{range}.pbf'},
  {...valid,layers:[...valid.layers,{id:'extra',type:'symbol',source:'basemap'}]},
  {...valid,sources:{...valid.sources,private:{type:'geojson',data:'https://external.test/private'}}}
 ]) assert.throws(()=>assertLocalBasemapStyle(mutated));
});
