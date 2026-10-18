const formats=[
  {mime:'image/jpeg',ext:'jpg',check:b=>b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff},
  {mime:'image/png',ext:'png',check:b=>b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))},
  {mime:'image/webp',ext:'webp',check:b=>b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'},
  {mime:'image/avif',ext:'avif',check:b=>b.length>=12&&b.toString('ascii',4,8)==='ftyp'&&['avif','avis'].includes(b.toString('ascii',8,12))},
];
export function detectImageFormat(buffer){return formats.find(format=>format.check(buffer))??null}
export function matchesDeclaredImageType(buffer,mime){const format=detectImageFormat(buffer);return format?.mime===mime?format:null}
