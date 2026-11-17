const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");
function load(relative,overrides={},globals={}){
 const filename=path.resolve(__dirname,"..",relative);
 const source=fs.readFileSync(filename,"utf8");
 const code=filename.endsWith(".ts")?ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText:source;
 const module={exports:{}};
 const req=id=>{
  if(Object.prototype.hasOwnProperty.call(overrides,id))return overrides[id];
  if(id.startsWith(".")){
   const absolute=path.resolve(path.dirname(filename),id);
   if(absolute.endsWith(".json"))return JSON.parse(fs.readFileSync(absolute,"utf8"));
   return load(path.relative(path.resolve(__dirname,".."),absolute.endsWith(".ts")?absolute:absolute+".ts"),overrides,globals);
  }
  return require(id);
 };
 vm.runInNewContext(code,{module,exports:module.exports,require:req,console,URL,URLSearchParams,Response,Request,Headers,
 AbortSignal,setTimeout,clearTimeout,Date,Intl,process,...globals},{filename});
 return module.exports;
}
const response={NextResponse:{json:(body,init={})=>({status:init.status??200,body,headers:init.headers,clone(){return response.NextResponse.json(body,init);}})}};
function clock(iso){const RealDate=Date;return class extends RealDate{constructor(...args){super(...(args.length?args:[iso]));}static now(){return new RealDate(iso).getTime();}};}
module.exports={load,response,clock};
