'use strict';
/** Pure build prerequisite policy; deliberately not a substitute for npm build or live tests. */
function evaluateBuildPrerequisites({nodeVersion='',required=[],available=[],lockfile=false}) {
 const major=Number((/^v?(\d+)\./.exec(nodeVersion)||[])[1]||0);
 const minor=Number((/^v?\d+\.(\d+)\./.exec(nodeVersion)||[])[1]||0);
 const compatible=(major>22||(major===22&&minor>=12));
 const known=new Set(available);
 const missing=[...new Set(required)].filter(name=>!known.has(name));
 const issues=[];
 if(!compatible)issues.push('UNSUPPORTED_NODE_VERSION');
 if(missing.length)issues.push('MISSING_DEPENDENCIES');
 const warnings=[];
 if(!lockfile)warnings.push('NO_LOCKFILE');
 return {ok:issues.length===0,issues,warnings,missing};
}
module.exports={evaluateBuildPrerequisites};
