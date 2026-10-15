import jwt from 'jsonwebtoken';
export function verifySession(token,{secret,nodeId,now=Date.now()}) {
  const claims=jwt.verify(token,secret,{algorithms:['HS256'],issuer:'taskchat-huddles',audience:`taskchat-media:${nodeId}`,clockTimestamp:Math.floor(now/1000)});
  for(const key of ['workspaceId','channelId','huddleId','sessionId','mediaId','userId'])if(typeof claims[key]!=='string' || !claims[key] || claims[key].length>100)throw new Error('Invalid media identity');
  if(!Number.isFinite(claims.exp) || claims.exp>Math.floor(now/1000)+90)throw new Error('Invalid media lease');
  return claims;
}
