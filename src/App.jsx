import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import * as api from "./lib/api";

const FONT = "'Courier New', Courier, monospace";
const C = {
  winGray:"#d4d0c8", winGray2:"#c0bdb4", winGray3:"#b8b4ac",
  white:"#ffffff", black:"#000000",
  titleBar:"linear-gradient(90deg,#00007a 0%,#1464b4 60%,#1e78d4 100%)",
  blue:"#000082", blueMid:"#1464b4", blueLight:"#5a8fd4",
  text:"#000000", textGray:"#444444", textLight:"#808080",
  green:"#006400", red:"#aa0000", yellow:"#7a6000", orange:"#804000",
  border:"#808080", borderD:"#404040",
};
const raised = { borderTop:"2px solid #ffffff", borderLeft:"2px solid #ffffff", borderBottom:"2px solid #404040", borderRight:"2px solid #404040" };
const sunken = { borderTop:"2px solid #808080", borderLeft:"2px solid #808080", borderBottom:"2px solid #dfdfdf", borderRight:"2px solid #dfdfdf" };
const winBtn = (active=false) => ({ ...raised, background:active?"#b8b4ac":C.winGray, cursor:"pointer", fontFamily:FONT, fontSize:11, color:C.text, padding:"3px 10px", minWidth:60, userSelect:"none" });
const titleBarStyle = { background:C.titleBar, color:"#fff", fontFamily:FONT, fontWeight:"bold", fontSize:12, padding:"3px 8px", letterSpacing:1, display:"flex", alignItems:"center", gap:8, userSelect:"none" };

const COLORS = [C.blue,"#cc0000","#007700","#aa6600","#660066","#000000","#005588"];
const COLOR_NAMES = { [C.blue]:"AZUL","#cc0000":"ROJO","#007700":"VERDE","#aa6600":"CAFÉ / NARANJA","#660066":"MORADO","#000000":"NEGRO","#005588":"AZUL MARINO" };

function genId(){ return Math.random().toString(36).substr(2,9); }
function now(){ return new Date().toLocaleString("es-CO"); }
// ── ALMACENAMIENTO: adaptador sobre Supabase (ver src/lib/api.js) ──
// La app conserva su API síncrona loadStore/saveStore; por debajo, un espejo
// en memoria se sincroniza con Supabase (diff + debounce).
function loadStore(){
  const s = api.getMirror();
  const images = {...(s.images||{})};
  if(!images["__guia_imgA__"]) images["__guia_imgA__"]={id:"__guia_imgA__",name:"Huella Dubitada (Guía)",src:GUIA_IMG_A,date:"2024-04-01",pinned:false,esGuia:true};
  if(!images["__guia_imgB__"]) images["__guia_imgB__"]={id:"__guia_imgB__",name:"Huella Indubitada (Guía)",src:GUIA_IMG_B,date:"2024-04-01",pinned:false,esGuia:true};
  const cotejos = {...(s.cotejos||{})};
  if(!cotejos[GUIA_COTEJO_ID]) cotejos[GUIA_COTEJO_ID]=GUIA_COTEJO;
  return {...s,images,cotejos};
}
function saveStore(d){ api.saveMirror(d); }
function clearStore(){ api.clearCategory("todo"); }
function logEvent(category,action,detail,actor){ api.logEvent(category,action,detail,actor); }
function seedHistoryFromData(){ /* el historial vive en Supabase */ }
function exportBackup(){ return api.exportBackup(); }
function importBackup(){ throw new Error("Con Supabase, restaure datos desde el panel de Supabase (Database → Backups)."); }
function getStorageSize(){ try{ return new Blob([JSON.stringify(api.getMirror())]).size; }catch(e){ return 0; } }
function formatBytes(b){ if(b<1024) return b+" B"; if(b<1024*1024) return (b/1024).toFixed(1)+" KB"; return (b/(1024*1024)).toFixed(2)+" MB"; }
function clearCategory(cat){ api.clearCategory(cat); }
const HIST_MAX = 500;

// ── EXPORTAR A PDF ────────────────────────────────────────────────
// Carga jsPDF desde CDN bajo demanda (no peso inicial).
// IMPORTANTE: en entornos sandbox (artifacts de Claude.ai) este CDN puede
// estar bloqueado. Funciona correctamente al desplegar en sitios web reales
// (Vercel, Netlify, GitHub Pages, hosting propio, etc.).
let _jsPDFLoaded = null;
function loadJsPDF(){
  if(_jsPDFLoaded) return _jsPDFLoaded;
  _jsPDFLoaded = new Promise((resolve,reject)=>{
    if(window.jspdf){resolve(window.jspdf.jsPDF);return;}
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = ()=>{
      if(window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF);
      else reject(new Error("La librería jsPDF no se inicializó correctamente."));
    };
    s.onerror = ()=>reject(new Error("No se pudo descargar jsPDF. Verifique su conexión a internet o que el dominio cdnjs.cloudflare.com no esté bloqueado por su navegador/red."));
    document.head.appendChild(s);
  });
  return _jsPDFLoaded;
}

// Dibuja huella + marcas en un canvas y devuelve dataURL
function renderCotejoSampleAsImage(imgSrc, shapes, callback){
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = ()=>{
    const cvs = document.createElement("canvas");
    cvs.width = img.naturalWidth;
    cvs.height = img.naturalHeight;
    const ctx = cvs.getContext("2d");
    ctx.drawImage(img,0,0);
    // Dibujar las marcas
    (shapes||[]).forEach(s=>{
      ctx.strokeStyle = s.color||"#cc0000";
      ctx.fillStyle = s.color||"#cc0000";
      ctx.lineWidth = 2;
      if(s.type==="circle"&&s.x!=null){
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r||14, 0, Math.PI*2);
        ctx.stroke();
        // Etiqueta numérica
        if(s.label){
          ctx.font = "bold 16px monospace";
          ctx.fillStyle = "#fff";
          ctx.strokeStyle = s.color||"#cc0000";
          ctx.lineWidth = 3;
          const tx = s.x + (s.r||14) + 4;
          const ty = s.y + 6;
          ctx.strokeText(String(s.label), tx, ty);
          ctx.fillStyle = s.color||"#cc0000";
          ctx.fillText(String(s.label), tx, ty);
        }
      } else if(s.type==="freehand"&&s.points){
        ctx.beginPath();
        s.points.forEach((p,i)=>{
          if(i===0) ctx.moveTo(p.x,p.y);
          else ctx.lineTo(p.x,p.y);
        });
        ctx.stroke();
      } else if(s.type==="polyline"&&s.points){
        ctx.beginPath();
        s.points.forEach((p,i)=>{
          if(i===0) ctx.moveTo(p.x,p.y);
          else ctx.lineTo(p.x,p.y);
        });
        ctx.stroke();
      }
    });
    callback(cvs.toDataURL("image/jpeg",0.85));
  };
  img.onerror = ()=>callback(null);
  img.src = imgSrc;
}

// Promesa que renderiza ambas muestras
function renderBothSamples(imgA, imgB, leftShapes, rightShapes){
  return Promise.all([
    new Promise(r=>renderCotejoSampleAsImage(imgA, leftShapes, r)),
    new Promise(r=>renderCotejoSampleAsImage(imgB, rightShapes, r)),
  ]);
}

// Función principal de exportación
async function exportCotejoPDF(cotejo, store, studentInfo){
  if(!cotejo) throw new Error("No hay cotejo para exportar");
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({unit:"mm",format:"a4"});
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // ── Encabezado (logo + título) ──
  // Logo: huella estilizada (círculos concéntricos)
  doc.setDrawColor(40,60,140);
  doc.setLineWidth(0.7);
  for(let i=0;i<5;i++){doc.circle(20,18,3+i*1.6);}
  doc.line(15,15,25,21); doc.line(15,21,25,15);

  doc.setFont("helvetica","bold");
  doc.setFontSize(18);
  doc.setTextColor(40,60,140);
  doc.text("SIMUSID", 30, 17);
  doc.setFontSize(10);
  doc.setFont("helvetica","normal");
  doc.text("Sistema de Identificación Dactiloscópica", 30, 22);

  doc.setDrawColor(40,60,140);
  doc.setLineWidth(0.6);
  doc.line(15, 28, W-15, 28);

  // Título principal
  doc.setFontSize(15);
  doc.setFont("helvetica","bold");
  doc.setTextColor(20,20,20);
  doc.text("ACTA DE PRÁCTICA ACADÉMICA", W/2, 38, {align:"center"});

  // ── Datos de la práctica ──
  doc.setFontSize(10);
  doc.setFont("helvetica","normal");
  let y = 48;
  const field = (label,value,xOff)=>{
    doc.setFont("helvetica","bold");
    doc.text(label, 15+xOff, y);
    doc.setFont("helvetica","normal");
    doc.text(value||"—", 50+xOff, y);
  };

  // Caja de datos
  doc.setDrawColor(150,150,150);
  doc.setLineWidth(0.3);
  doc.rect(15, y-5, W-30, 42);

  field("Práctica / Cotejo:", cotejo.name||"", 0); y+=6;
  field("Realizado por:", studentInfo?`${studentInfo.nombre} ${studentInfo.apellido}`:(cotejo.notePerito||"Docente"), 0); y+=6;
  field("Fecha de entrega:", cotejo.submittedAt||cotejo.finalizadoAt||new Date().toLocaleString("es-CO"), 0); y+=6;
  field("Tipo dactilograma:", (cotejo.fichaA?.n1diseno||cotejo.fichaB?.n1diseno)
    ? `Dubitada: ${cotejo.fichaA?.n1diseno||"—"} · Indubitada: ${cotejo.fichaB?.n1diseno||"—"}`
    : (cotejo.noteTipo||"—"), 0); y+=6;
  if(studentInfo){
    field("Estudiante:", `${studentInfo.nombre} ${studentInfo.apellido} (C.C. ${studentInfo.cedula})`, 0);
  }
  y+=10;

  // ── Imágenes de las muestras ──
  doc.setFont("helvetica","bold");
  doc.setFontSize(11);
  doc.setTextColor(40,60,140);
  doc.text("IDENTIFICACIÓN DE MUESTRAS", 15, y); y+=2;
  doc.setDrawColor(40,60,140);
  doc.line(15, y, W-15, y); y+=5;

  // Renderizar ambas muestras con marcas
  const images = store.images||{};
  const imgA = images[cotejo.imgA];
  const imgB = images[cotejo.imgB];
  if(imgA && imgB){
    try{
      const [dataA, dataB] = await renderBothSamples(imgA.src, imgB.src, cotejo.leftShapes, cotejo.rightShapes);
      const imgW = 75, imgH = 75;
      const xA = 25, xB = W - 25 - imgW;
      if(dataA){
        doc.addImage(dataA,"JPEG",xA,y,imgW,imgH);
        doc.setFont("helvetica","bold");
        doc.setFontSize(9);
        doc.setTextColor(60,60,60);
        doc.text("DUBITADA", xA+imgW/2, y+imgH+5, {align:"center"});
        doc.setFont("helvetica","normal");
        doc.setFontSize(8);
        doc.text(imgA.name||"", xA+imgW/2, y+imgH+10, {align:"center"});
      }
      if(dataB){
        doc.addImage(dataB,"JPEG",xB,y,imgW,imgH);
        doc.setFont("helvetica","bold");
        doc.setFontSize(9);
        doc.setTextColor(60,60,60);
        doc.text("INDUBITADA", xB+imgW/2, y+imgH+5, {align:"center"});
        doc.setFont("helvetica","normal");
        doc.setFontSize(8);
        doc.text(imgB.name||"", xB+imgW/2, y+imgH+10, {align:"center"});
      }
      y += imgH + 16;
    }catch(e){
      doc.setTextColor(150,0,0);
      doc.text("[No se pudieron cargar las imágenes]", W/2, y+10, {align:"center"});
      y += 20;
    }
  }

  // ── Tabla de puntos característicos ──
  if(y > H - 60){doc.addPage(); y = 20;}

  doc.setFont("helvetica","bold");
  doc.setFontSize(11);
  doc.setTextColor(40,60,140);
  doc.text("PUNTOS CARACTERÍSTICOS IDENTIFICADOS", 15, y); y+=2;
  doc.line(15, y, W-15, y); y+=6;

  // Encabezado de tabla
  const colX = [15, 28, 75, 110, 150];
  const headers = ["N°","TIPO","COLOR","POSICIÓN A","POSICIÓN B"];
  doc.setFillColor(40,60,140);
  doc.rect(15, y-4, W-30, 7, "F");
  doc.setTextColor(255,255,255);
  doc.setFontSize(9);
  headers.forEach((h,i)=>doc.text(h, colX[i], y));
  y+=5;

  // Filas: agrupar pares por label
  const leftShapes = (cotejo.leftShapes||[]).filter(s=>s.label);
  const rightShapes = (cotejo.rightShapes||[]).filter(s=>s.label);
  const labels = [...new Set([...leftShapes.map(s=>s.label),...rightShapes.map(s=>s.label)])].sort((a,b)=>a-b);
  const pointNames = cotejo.pointNames||[];

  doc.setFont("helvetica","normal");
  doc.setTextColor(40,40,40);
  let pares = 0;
  for(let label of labels){
    if(y > H - 20){doc.addPage(); y = 20;}
    const sA = leftShapes.find(s=>s.label===label);
    const sB = rightShapes.find(s=>s.label===label);
    if(!sA||!sB) continue;
    pares++;
    const tipo = pointNames[label-1] || `Punto ${label}`;
    const color = sA.color || "#cc0000";

    // Fila alterna sombreada
    if(label%2===0){
      doc.setFillColor(245,245,250);
      doc.rect(15, y-3, W-30, 6, "F");
    }
    doc.setTextColor(40,40,40);
    doc.setFont("helvetica","bold");
    doc.text(String(label), colX[0], y);
    doc.setFont("helvetica","normal");
    doc.text(tipo, colX[1], y);
    // Cuadradito de color
    const cR=parseInt(color.slice(1,3),16), cG=parseInt(color.slice(3,5),16), cB=parseInt(color.slice(5,7),16);
    doc.setFillColor(cR,cG,cB);
    doc.rect(colX[2], y-3, 5, 4, "F");
    doc.setDrawColor(120,120,120);
    doc.rect(colX[2], y-3, 5, 4);
    doc.text(color, colX[2]+7, y);
    if(sA.type==="circle") doc.text(`(${Math.round(sA.x)}, ${Math.round(sA.y)})`, colX[3], y);
    else doc.text("—", colX[3], y);
    if(sB.type==="circle") doc.text(`(${Math.round(sB.x)}, ${Math.round(sB.y)})`, colX[4], y);
    else doc.text("—", colX[4], y);
    y += 6;
  }

  if(pares===0){
    doc.setTextColor(150,0,0);
    doc.setFont("helvetica","italic");
    doc.text("Sin puntos característicos identificados con pares completos.", W/2, y, {align:"center"});
    y += 8;
  } else {
    y += 4;
    doc.setFont("helvetica","bold");
    doc.setFontSize(10);
    doc.setTextColor(40,60,140);
    doc.text(`Total de pares identificados: ${pares}`, 15, y);
    y += 8;
  }

  // ── Observaciones ──
  if(cotejo.noteObs){
    if(y > H - 50){doc.addPage(); y = 20;}
    doc.setFont("helvetica","bold");
    doc.setFontSize(11);
    doc.setTextColor(40,60,140);
    doc.text("OBSERVACIONES", 15, y); y+=2;
    doc.line(15, y, W-15, y); y+=6;
    doc.setFont("helvetica","normal");
    doc.setFontSize(10);
    doc.setTextColor(40,40,40);
    const obsLines = doc.splitTextToSize(cotejo.noteObs, W-30);
    doc.text(obsLines, 15, y);
    y += obsLines.length*5 + 8;
  }

  // ── Calificación (si aplica) ──
  if(cotejo.status==="calificado"){
    if(y > H - 50){doc.addPage(); y = 20;}
    doc.setFont("helvetica","bold");
    doc.setFontSize(11);
    doc.setTextColor(40,60,140);
    doc.text("EVALUACIÓN DEL DOCENTE", 15, y); y+=2;
    doc.line(15, y, W-15, y); y+=6;

    const grade = cotejo.grade||0;
    const gradeColor = grade>=80?[0,100,0]:grade>=60?[170,100,0]:[170,0,0];
    doc.setFont("helvetica","bold");
    doc.setFontSize(22);
    doc.setTextColor(...gradeColor);
    doc.text(`${grade}/100`, W/2, y+8, {align:"center"});
    y += 14;

    if(cotejo.feedback){
      doc.setFont("helvetica","italic");
      doc.setFontSize(10);
      doc.setTextColor(60,60,60);
      const fbLines = doc.splitTextToSize(`"${cotejo.feedback}"`, W-30);
      doc.text(fbLines, 15, y);
      y += fbLines.length*5 + 4;
    }
    if(cotejo.reviewedAt){
      doc.setFont("helvetica","normal");
      doc.setFontSize(9);
      doc.setTextColor(120,120,120);
      doc.text(`Evaluado el: ${cotejo.reviewedAt}`, 15, y);
      y += 5;
    }
  }

  // ── ANEXO: cotejo modelo del docente (solo si es un cotejo de estudiante con parent) ──
  const parentModel = cotejo.parentId ? (store.cotejos||{})[cotejo.parentId] : null;
  if(parentModel){
    doc.addPage(); y = 20;
    doc.setFont("helvetica","bold");
    doc.setFontSize(13);
    doc.setTextColor(40,60,140);
    doc.text("ANEXO — COTEJO MODELO DEL DOCENTE", W/2, y, {align:"center"}); y+=3;
    doc.setDrawColor(40,60,140);
    doc.line(15, y, W-15, y); y+=6;
    doc.setFont("helvetica","italic");
    doc.setFontSize(9);
    doc.setTextColor(100,100,100);
    doc.text("Marcas y puntos característicos de referencia definidos por el docente para esta práctica.", W/2, y, {align:"center"}); y+=8;

    const pImgA = (store.images||{})[parentModel.imgA];
    const pImgB = (store.images||{})[parentModel.imgB];
    if(pImgA && pImgB){
      try{
        const [pdA, pdB] = await renderBothSamples(pImgA.src, pImgB.src, parentModel.leftShapes, parentModel.rightShapes);
        const imgW = 75, imgH = 75;
        const xA = 25, xB = W - 25 - imgW;
        if(pdA){
          doc.addImage(pdA,"JPEG",xA,y,imgW,imgH);
          doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(60,60,60);
          doc.text("DUBITADA (docente)", xA+imgW/2, y+imgH+5, {align:"center"});
        }
        if(pdB){
          doc.addImage(pdB,"JPEG",xB,y,imgW,imgH);
          doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(60,60,60);
          doc.text("INDUBITADA (docente)", xB+imgW/2, y+imgH+5, {align:"center"});
        }
        y += imgH + 14;
      }catch(e){ y += 6; }
    }

    // Tabla de puntos del docente
    const pLeft = (parentModel.leftShapes||[]).filter(s=>s.label);
    const pRight = (parentModel.rightShapes||[]).filter(s=>s.label);
    const pLabels = [...new Set([...pLeft.map(s=>s.label),...pRight.map(s=>s.label)])].sort((a,b)=>a-b);
    const pNames = parentModel.pointNames||[];
    if(pLabels.length){
      doc.setFont("helvetica","bold");
      doc.setFontSize(11);
      doc.setTextColor(40,60,140);
      doc.text("PUNTOS CARACTERÍSTICOS DEL DOCENTE", 15, y); y+=2;
      doc.line(15, y, W-15, y); y+=6;
      doc.setFontSize(9);
      doc.setTextColor(40,40,40);
      let pPares = 0;
      for(let label of pLabels){
        if(y > H - 20){doc.addPage(); y = 20;}
        const sA = pLeft.find(s=>s.label===label);
        const sB = pRight.find(s=>s.label===label);
        if(!sA||!sB) continue;
        pPares++;
        if(label%2===0){ doc.setFillColor(245,245,250); doc.rect(15, y-3, W-30, 6, "F"); }
        doc.setFont("helvetica","bold");
        doc.text(String(label), 18, y);
        doc.setFont("helvetica","normal");
        doc.text(pNames[label-1] || `Punto ${label}`, 30, y);
        y += 6;
      }
      y += 4;
      doc.setFont("helvetica","bold");
      doc.setFontSize(10);
      doc.setTextColor(40,60,140);
      doc.text(`Pares del docente: ${pPares} · Pares del estudiante: ${pares}`, 15, y);
      y += 8;
    }
  }

  // ── Pie de página en todas las páginas ──
  const totalPages = doc.internal.getNumberOfPages();
  for(let i=1;i<=totalPages;i++){
    doc.setPage(i);
    doc.setFont("helvetica","normal");
    doc.setFontSize(8);
    doc.setTextColor(120,120,120);
    doc.line(15, H-15, W-15, H-15);
    doc.text(`SIMUSID v1.0 · Documento de uso académico`, 15, H-10);
    doc.text(`Página ${i} de ${totalPages}`, W-15, H-10, {align:"right"});
    doc.text(`Generado: ${new Date().toLocaleString("es-CO")}`, W/2, H-10, {align:"center"});
  }

  // Guardar
  const safeName = (cotejo.name||"cotejo").replace(/[^a-z0-9]/gi,"_").toLowerCase();
  const stamp = new Date().toISOString().slice(0,10);
  doc.save(`simusid_${safeName}_${stamp}.pdf`);
}


// ── IMÁGENES GUÍA PERMANENTES ─────────────────────────────────────
const GUIA_IMG_A = "/images/guia_a.jpeg";
const GUIA_IMG_B = "/images/guia_b.jpeg";
const GUIA_COTEJO_ID = "__guia_permanente__";
const GUIA_COTEJO = {
  id: GUIA_COTEJO_ID,
  name: "COTEJO GUÍA — Dedo Índice",
  imgA: "__guia_imgA__",
  imgB: "__guia_imgB__",
  date: "2024-04-01",
  leftShapes: [], rightShapes: [],
  maxLabel: 1, currentLabel: 1,
  noteCaso: "GUÍA", notePerito: "Sistema", noteFecha: "2024-04-01",
  noteObs: "Cotejo de práctica guía. Use las herramientas para marcar puntos característicos.",
  pointNames: Array(10).fill(""),
  owner: "docente", status: "modelo", published: true,
  esGuia: true
};


function smoothPath(pts){ if(pts.length<3)return pts; const s=Math.max(1,Math.floor(pts.length/60)); return pts.filter((_,i)=>i%s===0||i===pts.length-1); }

// ── VUCSA ─────────────────────────────────────────────────────────
function applyVUCSAEffect(img){
  const MAX=700,iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
  const sc=Math.min(1,MAX/Math.max(iw,ih,1));
  const w=Math.round(iw*sc),h=Math.round(ih*sc);
  const ofc=document.createElement("canvas"); ofc.width=w; ofc.height=h;
  const oc=ofc.getContext("2d"); oc.drawImage(img,0,0,w,h);
  const id=oc.getImageData(0,0,w,h); const d=id.data;
  const gray=new Uint8ClampedArray(w*h);
  for(let i=0;i<w*h;i++) gray[i]=Math.round(0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2]);
  const K=[1,2,1,2,4,2,1,2,1],blur=new Uint8ClampedArray(w*h);
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){let s=0,k=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)s+=gray[(y+dy)*w+(x+dx)]*K[k++];blur[y*w+x]=s>>4;}
  const mag=new Float32Array(w*h); let maxM=0;
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){const gx=-blur[(y-1)*w+(x-1)]+blur[(y-1)*w+(x+1)]-2*blur[y*w+(x-1)]+2*blur[y*w+(x+1)]-blur[(y+1)*w+(x-1)]+blur[(y+1)*w+(x+1)];const gy=-blur[(y-1)*w+(x-1)]-2*blur[(y-1)*w+x]-blur[(y-1)*w+(x+1)]+blur[(y+1)*w+(x-1)]+2*blur[(y+1)*w+x]+blur[(y+1)*w+(x+1)];mag[y*w+x]=Math.sqrt(gx*gx+gy*gy);if(mag[y*w+x]>maxM)maxM=mag[y*w+x];}
  const thr=maxM*0.13;
  for(let i=0;i<w*h;i++){const v=mag[i]>thr?0:255;d[i*4]=d[i*4+1]=d[i*4+2]=v;d[i*4+3]=255;}
  oc.putImageData(id,0,0); return ofc;
}

// ── RIDGES ────────────────────────────────────────────────────────
function applyRidgeOverlay(img){
  const MAX=700,iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
  const sc=Math.min(1,MAX/Math.max(iw,ih,1));
  const w=Math.round(iw*sc),h=Math.round(ih*sc);
  const tmp=document.createElement("canvas"); tmp.width=w; tmp.height=h;
  const tc=tmp.getContext("2d"); tc.drawImage(img,0,0,w,h);
  const id=tc.getImageData(0,0,w,h); const d=id.data;
  const gray=new Uint8ClampedArray(w*h);
  for(let i=0;i<w*h;i++) gray[i]=Math.round(0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2]);
  const K=[1,2,1,2,4,2,1,2,1],blur=new Uint8ClampedArray(w*h);
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){let s=0,k=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)s+=gray[(y+dy)*w+(x+dx)]*K[k++];blur[y*w+x]=s>>4;}
  const mag=new Float32Array(w*h); let maxM=0;
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){const gx=-blur[(y-1)*w+(x-1)]+blur[(y-1)*w+(x+1)]-2*blur[y*w+(x-1)]+2*blur[y*w+(x+1)]-blur[(y+1)*w+(x-1)]+blur[(y+1)*w+(x+1)];const gy=-blur[(y-1)*w+(x-1)]-2*blur[(y-1)*w+x]-blur[(y-1)*w+(x+1)]+blur[(y+1)*w+(x-1)]+2*blur[(y+1)*w+x]+blur[(y+1)*w+(x+1)];mag[y*w+x]=Math.sqrt(gx*gx+gy*gy);if(mag[y*w+x]>maxM)maxM=mag[y*w+x];}
  const ofc=document.createElement("canvas"); ofc.width=w; ofc.height=h;
  const oc=ofc.getContext("2d");
  const oid=oc.createImageData(w,h); const od=oid.data;
  const lo=maxM*0.09,hi=maxM*0.50;
  for(let i=0;i<w*h;i++){if(mag[i]>lo){const t=Math.min(1,(mag[i]-lo)/(hi-lo));od[i*4]=210;od[i*4+1]=25;od[i*4+2]=25;od[i*4+3]=Math.round(55+170*t);}}
  oc.putImageData(oid,0,0); return {canvas:ofc,iw,ih};
}

function drawShape(ctx,sh,isSel,hideLabels){
  const {type,x,y,r,color,label,points,preview}=sh;
  ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=isSel?3:2;
  if(isSel){ctx.shadowBlur=8;ctx.shadowColor="#0000ff";}
  if(type==="circle"){ctx.beginPath();ctx.arc(x,y,r||30,0,Math.PI*2);ctx.stroke();}
  else if(type==="freehand"&&points?.length>1){
    ctx.save();ctx.globalAlpha=0.82;ctx.lineWidth=6;ctx.lineCap="round";ctx.lineJoin="round";
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length-1;i++){const mx=(points[i].x+points[i+1].x)/2,my=(points[i].y+points[i+1].y)/2;ctx.quadraticCurveTo(points[i].x,points[i].y,mx,my);}
    ctx.lineTo(points[points.length-1].x,points[points.length-1].y);ctx.stroke();
    ctx.closePath();ctx.globalAlpha=0.22;ctx.fillStyle=color;ctx.fill();ctx.restore();
  }
  else if(type==="polyline"&&points?.length>1){
    ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=isSel?3:2;
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length;i++) ctx.lineTo(points[i].x,points[i].y);
    ctx.stroke();ctx.restore();
  }
  ctx.shadowBlur=0;
  if(label && !hideLabels){const lx=type==="circle"?x+(r||30)+4:x+4,ly=type==="circle"?y-(r||30)-4:y-5;ctx.font="bold 13px 'Courier New',monospace";const tw=ctx.measureText(label).width;ctx.fillStyle="rgba(255,255,255,0.9)";ctx.fillRect(lx-2,ly-13,tw+6,16);ctx.strokeStyle=color;ctx.lineWidth=1;ctx.strokeRect(lx-2,ly-13,tw+6,16);ctx.fillStyle=color;ctx.fillText(label,lx+1,ly);}
  ctx.shadowBlur=0;
}

// ── IMAGE PANEL ───────────────────────────────────────────────────
const ImagePanel = forwardRef(function ImagePanel({side,imgSrc,shapes,setShapes,tool,color,currentLabel,onShapePlaced,zoom,setZoom,syncZoom,setHistory,setRedoStack,imgFilter,setImgFilter,onSyncWheel,layers},ref){
  const cRef=useRef(null),cvRef=useRef(null),ovRef=useRef(null),imgRef=useRef(null);
  const vucsaCache=useRef(null),ridgeCache=useRef(null);
  // Crestas state (ref only — no React state needed)
  const cr=useRef({active:false,points:[],col:"#cc0000"});

  const [pan,setPan]=useState({x:0,y:0}),[drawing,setDrawing]=useState(null),[sel,setSel]=useState(null);
  const isPan=useRef(false),panS=useRef(null),drawS=useRef(null),isDrag=useRef(false),dragS=useRef(null),fpPts=useRef([]);
  const refs={pan:useRef(pan),zoom:useRef(zoom),shapes:useRef(shapes),drawing:useRef(drawing),sel:useRef(sel),filter:useRef(imgFilter),layers:useRef(layers||{images:true,quality:true,minucias:true,crestas:true,labels:true})};
  useEffect(()=>{refs.pan.current=pan;},[pan]);
  useEffect(()=>{refs.zoom.current=zoom;},[zoom]);
  useEffect(()=>{refs.shapes.current=shapes;},[shapes]);
  useEffect(()=>{refs.drawing.current=drawing;},[drawing]);
  useEffect(()=>{refs.sel.current=sel;},[sel]);
  useEffect(()=>{refs.filter.current=imgFilter;},[imgFilter]);
  useEffect(()=>{refs.layers.current=layers||{images:true,quality:true,minucias:true,crestas:true,labels:true};redraw();},[layers]);
  useEffect(()=>{if(!imgSrc)return;vucsaCache.current=null;ridgeCache.current=null;const i=new Image();i.crossOrigin="anonymous";i.onload=()=>{imgRef.current=i;redraw();};i.src=imgSrc;},[imgSrc]);

  // ── Main canvas redraw ────────────────────────────────────────
  const redraw=useCallback(()=>{
    const cv=cvRef.current,co=cRef.current;if(!cv||!co)return;
    cv.width=co.clientWidth;cv.height=co.clientHeight;
    const ctx=cv.getContext("2d");
    ctx.fillStyle="#e8e8e8";ctx.fillRect(0,0,cv.width,cv.height);
    ctx.save();ctx.translate(refs.pan.current.x,refs.pan.current.y);ctx.scale(refs.zoom.current,refs.zoom.current);
    const lyr=refs.layers.current||{};
    if(imgRef.current && lyr.images!==false){
      const f=refs.filter.current||{};
      const img=imgRef.current;
      const iw=img.naturalWidth||img.width;
      const ih=img.naturalHeight||img.height;
      // Aplicar flip y rotate: trabajar en sistema centrado en (iw/2, ih/2)
      const hasTransform = f.flipH || f.flipV || (f.rotate && f.rotate!==0);
      if(hasTransform){
        ctx.save();
        ctx.translate(iw/2, ih/2);
        if(f.rotate) ctx.rotate((f.rotate*Math.PI)/180);
        ctx.scale(f.flipH?-1:1, f.flipV?-1:1);
        ctx.translate(-iw/2, -ih/2);
      }
      if(f.vucsa){try{if(!vucsaCache.current)vucsaCache.current=applyVUCSAEffect(img);ctx.drawImage(vucsaCache.current,0,0,iw,ih);}catch(e){console.error("VUCSA:",e);ctx.drawImage(img,0,0,iw,ih);}}
      else{ctx.filter=`brightness(${f.brightness??100}%) contrast(${f.contrast??100}%) invert(${f.invert?1:0}) grayscale(${f.bw?1:0})`;ctx.drawImage(img,0,0);ctx.filter="none";
        if(f.ridge){try{if(!ridgeCache.current)ridgeCache.current=applyRidgeOverlay(img);const rc=ridgeCache.current;ctx.drawImage(rc.canvas,0,0,rc.iw,rc.ih);}catch(e){console.error("RIDGES:",e);}}}
      if(hasTransform) ctx.restore();
    }
    // Filtrar figuras por capa
    const visibleShapes = refs.shapes.current.filter(s=>{
      if(s.type==="circle") return lyr.minucias!==false;
      if(s.type==="freehand") return lyr.quality!==false;
      if(s.type==="polyline"||s.type==="ridge") return lyr.crestas!==false;
      return true;
    });
    const all=refs.drawing.current?[...visibleShapes,refs.drawing.current]:visibleShapes;
    all.forEach(sh=>drawShape(ctx,sh,sh.id===refs.sel.current,lyr.labels===false));
    ctx.restore();
    if(!imgRef.current){ctx.fillStyle="#888";ctx.font="12px 'Courier New',monospace";ctx.textAlign="center";ctx.fillText("SIN IMAGEN — CARGAR IMAGEN",cv.width/2,cv.height/2);ctx.textAlign="left";}
  },[]);

  useEffect(()=>{redraw();},[pan,zoom,shapes,drawing,sel,imgFilter,redraw]);
  useEffect(()=>{const ro=new ResizeObserver(()=>{redraw();drawOverlay();});if(cRef.current)ro.observe(cRef.current);return()=>ro.disconnect();},[redraw]);

  // ── Overlay canvas for CRESTAS (direct DOM, no React state) ──
  const drawOverlay=useCallback(()=>{
    const ov=ovRef.current,co=cRef.current;if(!ov||!co)return;
    ov.width=co.clientWidth;ov.height=co.clientHeight;
    const ctx=ov.getContext("2d");
    ctx.clearRect(0,0,ov.width,ov.height);
    if(!cr.current.active||cr.current.points.length===0)return;
    ctx.save();
    ctx.translate(refs.pan.current.x,refs.pan.current.y);
    ctx.scale(refs.zoom.current,refs.zoom.current);
    ctx.strokeStyle=cr.current.col;
    ctx.fillStyle=cr.current.col;
    ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=2.5;
    // Dot at each confirmed point
    cr.current.points.forEach(pt=>{ctx.beginPath();ctx.arc(pt.x,pt.y,5,0,Math.PI*2);ctx.fill();});
    // Confirmed segments
    if(cr.current.points.length>1){
      ctx.beginPath();ctx.moveTo(cr.current.points[0].x,cr.current.points[0].y);
      for(let i=1;i<cr.current.points.length;i++) ctx.lineTo(cr.current.points[i].x,cr.current.points[i].y);
      ctx.stroke();
    }
    // Dashed preview line to cursor
    if(cr.current.preview){
      const lp=cr.current.points[cr.current.points.length-1];
      if(Math.hypot(cr.current.preview.x-lp.x,cr.current.preview.y-lp.y)>2){
        ctx.save();ctx.globalAlpha=0.6;ctx.setLineDash([7,5]);
        ctx.beginPath();ctx.moveTo(lp.x,lp.y);ctx.lineTo(cr.current.preview.x,cr.current.preview.y);
        ctx.stroke();ctx.setLineDash([]);ctx.restore();
      }
    }
    ctx.restore();
  },[]);

  // Redraw overlay when pan/zoom changes while crestas is active
  useEffect(()=>{if(cr.current.active)drawOverlay();},[pan,zoom]);

  // Clear overlay when switching away from crestas
  useEffect(()=>{
    if(tool!=="crestas"&&cr.current.active){
      cr.current.active=false;cr.current.points=[];
      const ov=ovRef.current;
      if(ov){const ctx=ov.getContext("2d");ctx.clearRect(0,0,ov.width||0,ov.height||0);}
    }
  },[tool]);

  const push=(ns)=>{setHistory(h=>[...h,shapes]);setRedoStack([]);setShapes(ns);};
  const gp=(e)=>{const r=cvRef.current.getBoundingClientRect();return{x:(e.clientX-r.left-refs.pan.current.x)/refs.zoom.current,y:(e.clientY-r.top-refs.pan.current.y)/refs.zoom.current};};
  const hit=(p)=>{for(let i=refs.shapes.current.length-1;i>=0;i--){const s=refs.shapes.current[i];if(s.type==="circle"&&Math.abs(Math.hypot(p.x-s.x,p.y-s.y)-(s.r||30))<12)return s;}return null;};

  const onDown=(e)=>{
    if(e.button!==0)return;
    const p=gp(e);
    if(tool==="pan"){isPan.current=true;panS.current={mx:e.clientX,my:e.clientY,px:pan.x,py:pan.y};return;}
    if(tool==="select"){const h=hit(p);if(h){setSel(h.id);isDrag.current=true;dragS.current={mx:e.clientX,my:e.clientY,...h};}else setSel(null);return;}
    if(tool==="quality"){fpPts.current=[p];setDrawing({id:genId(),type:"freehand",points:[p],color,opacity:0.82,label:""});return;}
    if(tool==="crestas"){
      cr.current.col=color;
      if(!cr.current.active){cr.current.active=true;cr.current.points=[p];cr.current.preview=p;}
      else{cr.current.points=[...cr.current.points,p];cr.current.preview=p;}
      drawOverlay();
      return;
    }
    drawS.current=p;setDrawing({id:genId(),type:"circle",x:p.x,y:p.y,r:2,color,label:String(currentLabel)});
  };
  const onMove=(e)=>{
    if(tool==="pan"&&isPan.current){setPan({x:panS.current.px+e.clientX-panS.current.mx,y:panS.current.py+e.clientY-panS.current.my});return;}
    if(isDrag.current&&dragS.current){const dx=(e.clientX-dragS.current.mx)/refs.zoom.current,dy=(e.clientY-dragS.current.my)/refs.zoom.current,o=dragS.current;setShapes(prev=>prev.map(s=>s.id!==o.id?s:{...s,x:o.x+dx,y:o.y+dy}));return;}
    if(tool==="crestas"&&cr.current.active){cr.current.preview=gp(e);drawOverlay();return;}
    if(!refs.drawing.current)return;
    if(refs.drawing.current.type==="freehand"){const p=gp(e);fpPts.current.push(p);if(fpPts.current.length%4===0)setDrawing(d=>({...d,points:[...fpPts.current]}));return;}
    const p=gp(e),sp=drawS.current,dx=p.x-sp.x,dy=p.y-sp.y;setDrawing(d=>({...d,r:Math.max(2,Math.sqrt(dx*dx+dy*dy))}));
  };
  const onUp=()=>{
    isPan.current=false;
    if(isDrag.current){isDrag.current=false;dragS.current=null;return;}
    if(refs.drawing.current?.type==="freehand"){const sm=smoothPath(fpPts.current);if(sm.length>1)push([...shapes,{...refs.drawing.current,points:sm}]);setDrawing(null);fpPts.current=[];return;}
    if(drawing){push([...shapes,drawing]);setDrawing(null);onShapePlaced(side);}
  };
  const onDblClick=(e)=>{
    if(tool!=="crestas"||!cr.current.active)return;
    e.stopPropagation();
    let pts=[...cr.current.points];
    if(pts.length>=2){const a=pts[pts.length-1],b=pts[pts.length-2];if(Math.hypot(a.x-b.x,a.y-b.y)<12)pts=pts.slice(0,-1);}
    if(pts.length>=2) push([...shapes,{id:genId(),type:"polyline",points:pts,preview:null,color:cr.current.col,label:""}]);
    cr.current={active:false,points:[],col:cr.current.col};
    const ov=ovRef.current;if(ov){const ctx=ov.getContext("2d");ctx.clearRect(0,0,ov.width,ov.height);}
  };
  // Permite que el panel hermano aplique el mismo zoom centrado en las mismas
  // coordenadas relativas (sync zoom). El ratio se calcula contra el zoom actual
  // de ESTE panel (leído del ref para evitar usar un valor obsoleto).
  useImperativeHandle(ref,()=>({
    applySyncZoomAt(panelMx,panelMy,newZoom){
      const oldZoom=refs.zoom.current||1;
      if(!oldZoom||newZoom===oldZoom) return;
      setPan(p=>({
        x:panelMx-(panelMx-p.x)*(newZoom/oldZoom),
        y:panelMy-(panelMy-p.y)*(newZoom/oldZoom)
      }));
    }
  }),[]);

  const onWheel=(e)=>{
    e.preventDefault();
    const nz=Math.max(0.05,Math.min(20,zoom*(e.deltaY>0?0.88:1.12)));
    const r=cvRef.current.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
    setPan(p=>({x:mx-(mx-p.x)*(nz/zoom),y:my-(my-p.y)*(nz/zoom)}));
    if(syncZoom){
      setZoom(nz,"both");
      // Notificar al parent para que el otro panel se re-centre con el mismo (mx,my)
      if(onSyncWheel) onSyncWheel(side,mx,my,nz);
    } else {
      setZoom(nz,side);
    }
  };
  const delSel=useCallback(()=>{if(!refs.sel.current)return;push(shapes.filter(s=>s.id!==refs.sel.current));setSel(null);},[shapes]);
  useEffect(()=>{const h=(e)=>{if((e.key==="Delete"||e.key==="Backspace")&&refs.sel.current)delSel();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[delSel]);

  const cursors={select:"default",pan:"grab",circle:"crosshair",quality:"crosshair",crestas:"crosshair"};

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,minHeight:0,...sunken,background:C.white}}>
      <div style={{...titleBarStyle,fontSize:11}}>
        <span>{side==="left"?"▐ DUBITADA":"▐ INDUBITADA"}</span>
        <span style={{marginLeft:"auto",fontWeight:"normal",fontSize:10,color:"#cce"}}>
          {shapes.length} fig. · {Math.round(zoom*100)}%
          {imgFilter&&(imgFilter.brightness!==100||imgFilter.contrast!==100)&&<> · B:{imgFilter.brightness}% C:{imgFilter.contrast}%</>}
        </span>
      </div>
      {/* ── MINI-TOOLBAR de filtros + voltear + zoom (estilo AFIS) ─────── */}
      {setImgFilter&&<div style={{background:C.winGray,borderBottom:`1px solid ${C.border}`,padding:"2px 4px",display:"flex",alignItems:"center",gap:1,overflowX:"auto",overflowY:"hidden",whiteSpace:"nowrap",scrollbarWidth:"thin"}}>
        {/* Voltear */}
        <button onClick={()=>setImgFilter(p=>({...p,flipH:!p.flipH}))} title="Voltear horizontal" style={{...winBtn(imgFilter?.flipH),width:22,height:20,padding:0,fontSize:11,lineHeight:1,flexShrink:0}}>↔</button>
        <button onClick={()=>setImgFilter(p=>({...p,flipV:!p.flipV}))} title="Voltear vertical" style={{...winBtn(imgFilter?.flipV),width:22,height:20,padding:0,fontSize:11,lineHeight:1,flexShrink:0}}>↕</button>
        <button onClick={()=>setImgFilter(p=>({...p,rotate:((p.rotate||0)+90)%360}))} title="Rotar 90°" style={{...winBtn((imgFilter?.rotate||0)!==0),width:22,height:20,padding:0,fontSize:11,lineHeight:1,flexShrink:0}}>🔄</button>
        <div style={{width:1,height:16,background:C.border,margin:"0 3px",flexShrink:0}}/>
        {/* Filtros */}
        <button onClick={()=>setImgFilter(p=>({...p,brightness:Math.min(300,(p.brightness||100)+15)}))} title="Aumentar brillo" style={{...winBtn(),width:22,height:20,padding:0,fontSize:11,lineHeight:1,flexShrink:0}}>☀</button>
        <button onClick={()=>setImgFilter(p=>({...p,brightness:Math.max(0,(p.brightness||100)-15)}))} title="Reducir brillo" style={{...winBtn(),width:22,height:20,padding:0,fontSize:11,lineHeight:1,flexShrink:0}}>🌙</button>
        <button onClick={()=>setImgFilter(p=>({...p,contrast:Math.min(300,(p.contrast||100)+15)}))} title="Aumentar contraste" style={{...winBtn(),width:22,height:20,padding:0,fontSize:11,lineHeight:1,flexShrink:0}}>◐</button>
        <button onClick={()=>setImgFilter(p=>({...p,contrast:Math.max(0,(p.contrast||100)-15)}))} title="Reducir contraste" style={{...winBtn(),width:22,height:20,padding:0,fontSize:11,lineHeight:1,flexShrink:0}}>◑</button>
        <button onClick={()=>setImgFilter(p=>({...p,bw:!p.bw}))} title="Blanco y negro" style={{...winBtn(imgFilter?.bw),width:22,height:20,padding:0,fontSize:11,lineHeight:1,flexShrink:0}}>⚫</button>
        <button onClick={()=>setImgFilter(p=>({...p,invert:!p.invert}))} title="Invertir contraste (negativo)" style={{...winBtn(imgFilter?.invert),width:22,height:20,padding:0,fontSize:11,lineHeight:1,flexShrink:0}}>⊖</button>
        <button onClick={()=>setImgFilter(p=>({...p,vucsa:!p.vucsa}))} title="VUCSA — Visualización Ultra-Contrastada en Sepia Atenuada" style={{...winBtn(imgFilter?.vucsa),width:22,height:20,padding:0,fontSize:10,lineHeight:1,fontWeight:"bold",flexShrink:0}}>V</button>
        <button onClick={()=>setImgFilter(p=>({...p,ridge:!p.ridge}))} title="Realzar crestas (RIDGES)" style={{...winBtn(imgFilter?.ridge),width:22,height:20,padding:0,fontSize:10,lineHeight:1,fontWeight:"bold",flexShrink:0}}>R</button>
        <div style={{width:1,height:16,background:C.border,margin:"0 3px",flexShrink:0}}/>
        {/* Zoom */}
        <button onClick={()=>setZoom(Math.min(8,zoom*1.2),side)} title="Acercar (zoom +)" style={{...winBtn(),width:22,height:20,padding:0,fontSize:10,lineHeight:1,fontWeight:"bold",flexShrink:0}}>🔍+</button>
        <button onClick={()=>setZoom(Math.max(0.2,zoom/1.2),side)} title="Alejar (zoom -)" style={{...winBtn(),width:22,height:20,padding:0,fontSize:10,lineHeight:1,fontWeight:"bold",flexShrink:0}}>🔍-</button>
        <button onClick={()=>setZoom(1,side)} title="Restablecer zoom a 100%" style={{...winBtn(),width:26,height:20,padding:0,fontSize:9,lineHeight:1,flexShrink:0}}>1:1</button>
        <div style={{width:1,height:16,background:C.border,margin:"0 3px",flexShrink:0}}/>
        {/* Reset */}
        <button onClick={()=>setImgFilter({brightness:100,contrast:100,bw:false,invert:false,vucsa:false,ridge:false,flipH:false,flipV:false,rotate:0})} title="Restablecer todos los filtros" style={{...winBtn(),width:22,height:20,padding:0,fontSize:11,lineHeight:1,flexShrink:0}}>↺</button>
      </div>}
      <div ref={cRef} style={{flex:1,position:"relative",overflow:"hidden",cursor:cursors[tool]||"crosshair"}}>
        <canvas ref={cvRef} style={{display:"block",width:"100%",height:"100%",position:"absolute",top:0,left:0}}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onWheel={onWheel} onDoubleClick={onDblClick}/>
        {/* Overlay canvas ONLY for crestas — always on top, no pointer events */}
        <canvas ref={ovRef} style={{display:"block",width:"100%",height:"100%",position:"absolute",top:0,left:0,pointerEvents:"none"}}/>
      </div>
    </div>
  );
});

// ── HOME SCREEN ───────────────────────────────────────────────────
function HomeScreen({onEnterCotejo,onLogout}){
  const [store,setStore]=useState(()=>loadStore());
  const [tab,setTab]=useState("usuarios");
  const [confirmDel,setConfirmDel]=useState(null);
  const [syncMsg,setSyncMsg]=useState("");
  const [modalUsuario,setModalUsuario]=useState(null); // "docente" | "estudiante"
  const [searchEstudiantes,setSearchEstudiantes]=useState("");
  const [showHelp,setShowHelp]=useState(false);
  const [showAbout,setShowAbout]=useState(false);
  // ── Estados nuevos (Fase 1) ────────────────────────────────────
  const [newDocente,setNewDocente]=useState(null);   // {user,pass,nombre}
  const [docenteErr,setDocenteErr]=useState("");
  const [confirmDelDoc,setConfirmDelDoc]=useState(null);
  const [confirmReset,setConfirmReset]=useState(null); // "cotejos"|"imagenes"|"estudiantes"|"todo"
  const [importErr,setImportErr]=useState("");
  const [histFilter,setHistFilter]=useState("todos"); // categoría del historial
  const fileImportRef=useRef(null);

  // Seed del historial UNA vez a partir de datos existentes
  useEffect(()=>{seedHistoryFromData();setStore(loadStore());},[]);

  const images=store.images||{},cotejos=store.cotejos||{};
  const persist=(u)=>{setStore(u);saveStore(u);};
  const refresh=()=>setStore(loadStore());
  const flash=(m)=>{setSyncMsg(m);setTimeout(()=>setSyncMsg(""),2500);};


  // ── Acciones nuevas: docentes, backup, borrado selectivo ──────
  const docentesList=Object.values(store.docentes||{}).sort((a,b)=>a.user.localeCompare(b.user));
  const createDocente=async()=>{
    const {user,pass,nombre}=newDocente||{};
    if(!user?.trim()||!pass?.trim()||!nombre?.trim()){setDocenteErr("Complete todos los campos.");return;}
    if(!/^[a-z0-9_.-]{3,20}$/i.test(user.trim())){setDocenteErr("Usuario inválido: 3-20 caracteres, solo letras, números, punto, guion o _ (sin espacios).");return;}
    if(pass.trim().length<6){setDocenteErr("La contraseña debe tener mínimo 6 caracteres.");return;}
    setDocenteErr("⏳ Creando cuenta...");
    try{
      await api.createDocente(user.trim().toLowerCase(),pass.trim(),nombre.trim());
      setStore(loadStore());
      logEvent("usuario","crear_docente",`Docente "${user.trim()}" creado`,"admin");
      setNewDocente(null);setDocenteErr("");flash("✓ Docente creado");
    }catch(err){setDocenteErr("⚠ "+(err.message||"Error al crear docente"));}
  };
  const deleteDocente=async(d)=>{
    try{
      await api.deleteDocente(d.id);
      setStore(loadStore());
      logEvent("usuario","borrar_docente",`Docente "${d.nombre}" eliminado`,"admin");
      setConfirmDelDoc(null);flash("✓ Docente eliminado");
    }catch(err){flash("⚠ "+(err.message||"Error"));setConfirmDelDoc(null);}
  };
  const handleExport=()=>{
    try{
      const json=exportBackup();
      const blob=new Blob([json],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      const stamp=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
      a.href=url;a.download=`simusid_backup_${stamp}.json`;
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      URL.revokeObjectURL(url);
      logEvent("sistema","backup_export","Backup exportado","admin");
      flash("✓ Backup descargado");
    }catch(err){flash("⚠ Error al exportar");}
  };
  const handleImport=(e)=>{
    const f=e.target.files[0];if(!f)return;
    setImportErr("");
    const rd=new FileReader();
    rd.onload=ev=>{
      try{
        importBackup(ev.target.result);
        refresh();flash("✓ Backup restaurado");
      }catch(err){setImportErr(err.message||"Error al importar.");}
    };
    rd.readAsText(f);e.target.value="";
  };
  const doReset=(cat)=>{
    clearCategory(cat);
    refresh();setConfirmReset(null);
    flash(cat==="todo"?"✓ Sistema reiniciado":`✓ ${cat} eliminados`);
  };

  const estudiantesList=Object.values(store.estudiantes||{}).sort((a,b)=>a.apellido.localeCompare(b.apellido));
  const Btn=(col=C.blue)=>({...raised,background:"transparent",border:`1px solid ${col}`,color:col,fontFamily:FONT,fontSize:10,padding:"4px 12px",cursor:"pointer"});

  return(
    <div style={{background:C.winGray,minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
      <div style={{...titleBarStyle,fontSize:14,padding:"4px 12px",borderBottom:`2px solid ${C.borderD}`}}>
        <FpLogo size={30} stroke="#fff"/><span style={{marginLeft:6}}>SIMUSID</span>
        <span style={{fontWeight:"normal",fontSize:10,letterSpacing:2}}>— SISTEMA DE IDENTIFICACIÓN DACTILOSCÓPICA</span>
        <span style={{marginLeft:"auto",fontSize:10,color:"#cce"}}>v1.0</span>
      </div>
      <div style={{background:C.winGray,borderBottom:`1px solid ${C.border}`,padding:"2px 8px",display:"flex",gap:4,alignItems:"center"}}>
        <AdminMenuBar
          current={tab}
          onSelect={setTab}
          onLogout={onLogout}
          onExport={handleExport}
          onImport={()=>fileImportRef.current?.click()}
          onHelp={()=>setShowHelp(true)}
          onAbout={()=>setShowAbout(true)}
        />
        <input ref={fileImportRef} type="file" accept="application/json,.json" onChange={handleImport} style={{display:"none"}}/>
        {syncMsg&&<span style={{marginLeft:10,fontSize:10,color:C.blue,fontWeight:"bold"}}>{syncMsg}</span>}
        <span style={{marginLeft:"auto",fontSize:10,color:C.blue,fontWeight:"bold",letterSpacing:1}}>
          {(()=>{const labels={dashboard:"📊 Dashboard",analitica:"📈 Analítica",cotejos:"📋 Cotejos",galeria:"🖼️ Galería",usuarios:"👥 Usuarios",docentes:"👨‍🏫 Docentes",config:"⚙️ Configuración",datos:"💾 Datos y Respaldo",historial:"📜 Historial"};return labels[tab]||tab;})()}
        </span>
      </div>
      <div style={{flex:1,...sunken,margin:"0 8px 8px",background:C.winGray,padding:12,overflowY:"auto"}}>
        {tab==="usuarios"&&<>
          {/* Modal detalle docente */}
          {modalUsuario==="docente"&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{...raised,background:C.winGray,padding:0,width:460,maxWidth:"95vw",maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
              <div style={{...titleBarStyle,fontSize:12,padding:"5px 10px"}}>
                👨‍🏫 Información del Docente
                <button onClick={()=>setModalUsuario(null)} style={{...winBtn(),marginLeft:"auto",padding:"0 6px",minWidth:20,fontSize:11}}>✕</button>
              </div>
              <div style={{padding:16,overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>
                <div style={{...sunken,background:C.white,padding:"10px 14px",display:"flex",gap:14,alignItems:"center"}}>
                  <span style={{fontSize:36}}>👨‍🏫</span>
                  <div>
                    <div style={{fontWeight:"bold",fontSize:13,color:"#006400"}}>DOCENTE</div>
                    <div style={{fontSize:11,color:C.textGray,marginTop:2}}>Usuario: <b>docente1</b></div>
                    <div style={{fontSize:10,color:C.textLight,marginTop:1}}>Rol: Docente del sistema SIMUSID</div>
                  </div>
                </div>
                <div style={{...sunken,background:C.white,padding:"8px 12px",fontSize:11}}>
                  <div style={{fontWeight:"bold",color:"#006400",marginBottom:6}}>▐ ESTADÍSTICAS</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    {[
                      {l:"Cotejos Modelo",v:Object.values(cotejos).filter(c=>c.owner==="docente"&&!c.esGuia).length},
                      {l:"Publicados",v:Object.values(cotejos).filter(c=>c.owner==="docente"&&c.published&&!c.esGuia).length},
                      {l:"Estudiantes",v:estudiantesList.length}
                    ].map((s,i)=>(
                      <div key={i} style={{...raised,background:C.winGray,padding:"8px 10px",textAlign:"center"}}>
                        <div style={{fontSize:20,fontWeight:"bold",color:"#006400"}}>{s.v}</div>
                        <div style={{fontSize:9,color:C.textLight}}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{...sunken,background:C.white,padding:"8px 12px",fontSize:11}}>
                  <div style={{fontWeight:"bold",color:"#006400",marginBottom:6}}>▐ ESTUDIANTES REGISTRADOS ({estudiantesList.length})</div>
                  {estudiantesList.length===0
                    ? <div style={{color:C.textLight,fontSize:10}}>No hay estudiantes registrados.</div>
                    : <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {estudiantesList.map((est,i)=>(
                          <div key={est.id} style={{...raised,display:"flex",alignItems:"center",gap:10,padding:"6px 10px",background:C.winGray}}>
                            <span style={{fontWeight:"bold",fontSize:11,color:"#006400",minWidth:18}}>{i+1}.</span>
                            <div style={{flex:1}}>
                              <div style={{fontWeight:"bold",fontSize:11}}>{est.nombre} {est.apellido}</div>
                              <div style={{fontSize:9,color:C.textLight}}>C.C.: {est.cedula}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                  }
                </div>
              </div>
              <div style={{padding:"6px 12px",borderTop:`1px solid ${C.border}`}}>
                <button onClick={()=>setModalUsuario(null)} style={winBtn()}>Cerrar</button>
              </div>
            </div>
          </div>)}
          {/* Modal detalle estudiantes */}
          {modalUsuario==="estudiante"&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{...raised,background:C.winGray,padding:0,width:480,maxWidth:"95vw",maxHeight:"82vh",display:"flex",flexDirection:"column"}}>
              <div style={{...titleBarStyle,fontSize:12,padding:"5px 10px"}}>
                🎓 Estudiantes Registrados
                <button onClick={()=>setModalUsuario(null)} style={{...winBtn(),marginLeft:"auto",padding:"0 6px",minWidth:20,fontSize:11}}>✕</button>
              </div>
              <div style={{padding:16,overflowY:"auto",display:"flex",flexDirection:"column",gap:8}}>
                <div style={{...sunken,background:"#fffff0",padding:"6px 10px",fontSize:10,color:"#7a6000"}}>
                  ℹ Total de estudiantes registrados por el docente: <b>{estudiantesList.length}</b>
                </div>
                {estudiantesList.length===0
                  ? <div style={{...sunken,background:C.white,padding:30,textAlign:"center",color:C.textLight,fontSize:11}}>El docente aún no ha registrado estudiantes.</div>
                  : estudiantesList.map((est,i)=>{
                      const entregados=Object.values(cotejos).filter(c=>c.owner==="estudiante"&&c.studentId===est.cedula&&(c.status==="entregado"||c.status==="calificado")).length;
                      const enProgreso=Object.values(cotejos).filter(c=>c.owner==="estudiante"&&c.studentId===est.cedula&&c.status==="en_progreso").length;
                      return(
                        <div key={est.id} style={{...raised,display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:C.winGray}}>
                          <div style={{...sunken,background:C.blue,color:"#fff",width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:"bold",fontSize:13,flexShrink:0}}>{i+1}</div>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:"bold",fontSize:12,color:C.blue}}>{est.nombre} {est.apellido}</div>
                            <div style={{fontSize:10,color:C.textGray}}>C.C.: <b style={{letterSpacing:1}}>{est.cedula}</b></div>
                            <div style={{fontSize:9,color:C.textLight}}>Registrado: {est.date}</div>
                          </div>
                          <div style={{display:"flex",gap:6,flexShrink:0}}>
                            <div style={{...sunken,background:C.white,padding:"4px 10px",textAlign:"center"}}>
                              <div style={{fontSize:9,color:C.textLight}}>Entregados</div>
                              <div style={{fontWeight:"bold",fontSize:16,color:"#006400"}}>{entregados}</div>
                            </div>
                            <div style={{...sunken,background:C.white,padding:"4px 10px",textAlign:"center"}}>
                              <div style={{fontSize:9,color:C.textLight}}>En Progreso</div>
                              <div style={{fontWeight:"bold",fontSize:16,color:"#aa6600"}}>{enProgreso}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                }
              </div>
              <div style={{padding:"6px 12px",borderTop:`1px solid ${C.border}`}}>
                <button onClick={()=>setModalUsuario(null)} style={winBtn()}>Cerrar</button>
              </div>
            </div>
          </div>)}
          {/* Tarjetas resumen */}
          <div style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:C.blue,marginBottom:12}}>▐ PANEL DE USUARIOS</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={{...raised,background:C.winGray,padding:"18px 20px",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:36}}>👨‍🏫</span>
                <div>
                  <div style={{fontWeight:"bold",fontSize:13,color:"#006400"}}>DOCENTE</div>
                  <div style={{fontSize:10,color:C.textGray}}>1 cuenta activa</div>
                </div>
              </div>
              <div style={{...sunken,background:C.white,padding:"8px 12px",fontSize:11,lineHeight:1.9}}>
                Usuario: <b>docente1</b><br/>
                Cotejos modelo: <b>{Object.values(cotejos).filter(c=>c.owner==="docente"&&!c.esGuia).length}</b><br/>
                Estudiantes a cargo: <b style={{color:"#006400"}}>{estudiantesList.length}</b>
              </div>
              <button onClick={()=>setModalUsuario("docente")} style={{...winBtn(),fontWeight:"bold",color:"#006400",padding:"6px 12px"}}>👁 Ver Docente</button>
            </div>
            <div style={{...raised,background:C.winGray,padding:"18px 20px",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:36}}>🎓</span>
                <div>
                  <div style={{fontWeight:"bold",fontSize:13,color:C.blue}}>ESTUDIANTES</div>
                  <div style={{fontSize:10,color:C.textGray}}>{estudiantesList.length} registrado{estudiantesList.length!==1?"s":""}</div>
                </div>
              </div>
              <div style={{...sunken,background:C.white,padding:"8px 12px",fontSize:11,lineHeight:1.9}}>
                Total registrados: <b style={{color:C.blue}}>{estudiantesList.length}</b><br/>
                Cotejos entregados: <b>{Object.values(cotejos).filter(c=>c.owner==="estudiante"&&(c.status==="entregado"||c.status==="calificado")).length}</b><br/>
                En progreso: <b>{Object.values(cotejos).filter(c=>c.owner==="estudiante"&&c.status==="en_progreso").length}</b>
              </div>
              <button onClick={()=>setModalUsuario("estudiante")} style={{...winBtn(),fontWeight:"bold",color:C.blue,padding:"6px 12px"}}>👁 Ver Estudiantes</button>
            </div>
          </div>
        </>}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ═══ VISTA: ANALÍTICA ════════════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════════ */}


        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ═══ VISTA: DOCENTES ═════════════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab==="docentes"&&<>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <span style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:C.blue}}>▐ GESTIÓN DE DOCENTES</span>
            <span style={{fontSize:10,color:C.textLight}}>({docentesList.length} registrado{docentesList.length===1?"":"s"})</span>
            <button onClick={()=>{setNewDocente({user:"",pass:"",nombre:""});setDocenteErr("");}} style={{...winBtn(),marginLeft:"auto"}}>+ Nuevo Docente</button>
          </div>
          <div style={{...sunken,background:"#fffff0",padding:"8px 12px",marginBottom:10,fontSize:10,color:"#7a6000",lineHeight:1.6}}>
            ℹ <b>Docente del sistema:</b> los docentes creados aquí inician sesión con su <b>email</b> y la contraseña que defina. Podrán cambiarla luego.
          </div>
          {docentesList.length===0&&<div style={{...sunken,background:C.white,padding:30,textAlign:"center",color:C.textLight,fontSize:11}}>
            No hay docentes adicionales registrados.<br/>Use <b>+ Nuevo Docente</b> para añadir uno.
          </div>}
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {docentesList.map((d,i)=>(
              <div key={d.id} style={{...raised,display:"flex",alignItems:"center",background:C.winGray,padding:"8px 12px",gap:12}}>
                <div style={{...sunken,background:"#006400",color:"#fff",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:"bold",fontSize:12,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
                  <div style={{fontWeight:"bold",fontSize:12,color:"#006400"}}>👨‍🏫 {d.nombre}</div>
                  <div style={{fontSize:10,color:C.textGray}}>Usuario: <b style={{color:C.blue,letterSpacing:1}}>{d.user}</b> · Clave: <b style={{letterSpacing:1}}>{"•".repeat(d.pass.length)}</b> · Creado: {d.date}</div>
                </div>
                <button onClick={()=>setConfirmDelDoc(d)} style={{...winBtn(),color:C.red,fontSize:10,padding:"3px 8px",flexShrink:0}}>🗑 Eliminar</button>
              </div>
            ))}
          </div>
        </>}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ═══ VISTA: CONFIGURACIÓN ════════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ═══ VISTA: SISTEMA (Configuración + Datos y Respaldo) ═══ */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab==="sistema"&&<>
          <ConfigView store={store}/>
          <div style={{height:14}}/>
          <DatosRespaldoView
            store={store}
            onExport={handleExport}
            onImportClick={()=>fileImportRef.current?.click()}
            importErr={importErr}
            onReset={(cat)=>setConfirmReset(cat)}
          />
        </>}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ═══ VISTA: HISTORIAL ════════════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab==="historial"&&<HistorialView
          store={store}
          filter={histFilter}
          onFilter={setHistFilter}
        />}
      </div>

      {/* ── Modal: crear docente ─────────────────────────────────── */}
      {newDocente&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{...raised,background:C.winGray,padding:0,width:420,maxWidth:"95vw"}}>
          <div style={{...titleBarStyle,fontSize:12,padding:"5px 10px"}}>
            👨‍🏫 Registrar Nuevo Docente
            <button onClick={()=>setNewDocente(null)} style={{...winBtn(),marginLeft:"auto",padding:"0 6px",minWidth:20,fontSize:11}}>✕</button>
          </div>
          <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:10}}>
            <div style={{...sunken,background:"#fffff0",padding:"6px 10px",fontSize:10,color:"#7a6000",lineHeight:1.6}}>
              ℹ El docente podrá ingresar al sistema con el <b>usuario</b> y la <b>contraseña</b> que defina aquí. Mínimo 3 caracteres en el usuario.
            </div>
            {[
              {l:"Nombre completo:",k:"nombre",p:"Ej: Dra. María Pérez",type:"text"},
              {l:"Usuario:",k:"user",p:"Ej: docente1 (sin espacios)",type:"text"},
              {l:"Contraseña:",k:"pass",p:"Mínimo 6 caracteres",type:"password"},
            ].map(f=>(
              <div key={f.k} style={{display:"grid",gridTemplateColumns:"130px 1fr",alignItems:"center",gap:8}}>
                <label style={{fontSize:11,fontWeight:"bold",color:"#006400",textAlign:"right"}}>{f.l}</label>
                <input value={newDocente[f.k]} onChange={e=>setNewDocente(n=>({...n,[f.k]:e.target.value}))} placeholder={f.p} autoComplete="off" type={f.type}
                  style={{...sunken,fontFamily:FONT,fontSize:12,padding:"4px 8px",color:C.text,outline:"none",background:C.white}}/>
              </div>
            ))}
            {newDocente.user&&newDocente.pass&&newDocente.nombre&&(
              <div style={{...sunken,background:"#e8f0e8",padding:"8px 12px",fontSize:10,color:"#006400",lineHeight:1.8}}>
                <b>Vista previa de acceso:</b><br/>
                👨‍🏫 <b>{newDocente.nombre.trim()}</b><br/>
                🔑 Usuario: <b>{newDocente.user.trim()}</b> · Contraseña: <b>{newDocente.pass.trim()}</b>
              </div>
            )}
            {docenteErr&&<div style={{background:"#ffcccc",border:"1px solid #cc0000",padding:"5px 10px",fontSize:10,color:C.red,textAlign:"center"}}>{docenteErr}</div>}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:4}}>
              <button onClick={()=>setNewDocente(null)} style={winBtn()}>Cancelar</button>
              <button onClick={createDocente} style={{...winBtn(),fontWeight:"bold",color:"#006400"}}>✓ Registrar Docente</button>
            </div>
          </div>
        </div>
      </div>)}

      {/* ── Modal: confirmar eliminar docente ───────────────────── */}
      {confirmDelDoc&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{...raised,background:C.winGray,padding:0,width:340}}>
          <div style={{...titleBarStyle,fontSize:11}}>⚠ Eliminar docente</div>
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:12,alignItems:"center"}}>
            <span style={{fontSize:11,textAlign:"center"}}>¿Eliminar al docente <b>{confirmDelDoc.nombre}</b> ({confirmDelDoc.user})?</span>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmDelDoc(null)} style={winBtn()}>Cancelar</button>
              <button onClick={()=>deleteDocente(confirmDelDoc)} style={{...winBtn(),color:C.red}}>Sí, Eliminar</button>
            </div>
          </div>
        </div>
      </div>)}

      {/* ── Modal: confirmar reset selectivo ─────────────────────── */}
      {confirmReset&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{...raised,background:C.winGray,padding:0,width:400}}>
          <div style={{...titleBarStyle,fontSize:11,background:"linear-gradient(90deg,#8a0000 0%,#cc0000 100%)"}}>⚠ Acción destructiva</div>
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
            <div style={{...sunken,background:"#fff0f0",padding:"10px 12px",fontSize:11,color:"#7a0000",lineHeight:1.6}}>
              {confirmReset==="cotejos"&&<>Va a eliminar <b>TODOS los cotejos</b> del sistema (excepto el cotejo guía permanente). Esta acción <b>no se puede deshacer</b>.</>}
              {confirmReset==="imagenes"&&<>Va a eliminar <b>TODAS las imágenes</b> subidas (excepto las imágenes guía permanentes). Los cotejos que las usen quedarán sin imagen.</>}
              {confirmReset==="estudiantes"&&<>Va a eliminar <b>TODOS los estudiantes</b> y sus cotejos asociados. Esta acción <b>no se puede deshacer</b>.</>}
              {confirmReset==="todo"&&<><b>⚠ ATENCIÓN MÁXIMA</b><br/>Va a eliminar <b>TODOS los datos del sistema</b>: cotejos, imágenes, estudiantes, docentes y configuración. <b>No se puede deshacer.</b></>}
            </div>
            <div style={{...sunken,background:"#fffff0",padding:"6px 10px",fontSize:10,color:"#7a6000"}}>
              💡 <b>Consejo:</b> antes de borrar, exporte un backup desde la sección <b>Datos y Respaldo</b>.
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setConfirmReset(null)} style={winBtn()}>Cancelar</button>
              <button onClick={()=>doReset(confirmReset)} style={{...winBtn(),color:C.red,fontWeight:"bold"}}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      </div>)}

      {confirmDel&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{...raised,background:C.winGray,padding:0,width:320}}>
          <div style={{...titleBarStyle,fontSize:11}}>⚠ Confirmar eliminación</div>
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:12,alignItems:"center"}}>
            <span style={{fontSize:11}}>Esta acción no se puede deshacer.</span>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmDel(null)} style={winBtn()}>Cancelar</button>
              <button onClick={()=>{
                const s={...store};
                let what="elemento";
                if(s.images?.[confirmDel]){const i={...s.images};what=`Imagen "${i[confirmDel].name}"`;delete i[confirmDel];s.images=i;}
                else if(s.cotejos?.[confirmDel]){const c={...s.cotejos};what=`Cotejo "${c[confirmDel].name}"`;delete c[confirmDel];s.cotejos=c;}
                persist(s);
                logEvent(s.images?.[confirmDel]===undefined?"imagen":"cotejo","borrar",`${what} eliminado`,"admin");
                setConfirmDel(null);
              }} style={{...winBtn(),color:C.red}}>Sí, Eliminar</button>
            </div>
          </div>
        </div>
      </div>)}
      <div style={{background:C.winGray2,borderTop:`1px solid ${C.border}`,padding:"2px 12px",display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontFamily:FONT,fontSize:10,color:C.textLight}}>SIMUSID v1.0</span>
        <span style={{marginLeft:"auto",fontFamily:FONT,fontSize:10,color:C.textLight}}>ENTORNO ACADÉMICO DE PRÁCTICA</span>
        <LiveClock/>
      </div>
      {showHelp&&<HelpModal onClose={()=>setShowHelp(false)}/>}
      {showAbout&&<AboutModal onClose={()=>setShowAbout(false)}/>}
    </div>
  );
}

// ── ADMIN MENU BAR (Win95 style) ─────────────────────────────────
// Barra con dos menús desplegables: "Archivo" y "Ver".
function MenuItem({label,onClick,color=C.text,disabled,danger}){
  const [hov,setHov]=useState(false);
  return(<div onClick={disabled?undefined:onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
    style={{padding:"5px 24px 5px 22px",fontSize:11,fontFamily:FONT,cursor:disabled?"default":"pointer",
      background:hov&&!disabled?(danger?"#aa0000":C.blue):"transparent",
      color:disabled?C.textLight:(hov?"#fff":(danger?C.red:color)),whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6}}>
    {label}
  </div>);
}
function MenuSeparator(){return <div style={{height:1,background:C.border,margin:"3px 6px"}}/>;}
function MenuButton({label,open,onClick,underline}){
  return(<span onClick={onClick}
    style={{fontFamily:FONT,fontSize:11,padding:"2px 10px",cursor:"pointer",color:C.text,
      background:open?C.winGray3:"transparent",userSelect:"none",display:"inline-block"}}>
    {underline?<><u>{label[0]}</u>{label.slice(1)}</>:label}
  </span>);
}
function AdminMenuBar({current,onSelect,onLogout,onExport,onImport,onHelp,onAbout}){
  const [open,setOpen]=useState(null); // "archivo" | "ver" | "ayuda" | null
  const isActive=(id)=>current===id;
  const close=()=>setOpen(null);
  const go=(id)=>{onSelect(id);close();};

  return(<div style={{display:"flex",gap:2,position:"relative"}} onMouseLeave={close}>
    {/* ─── ARCHIVO ─── */}
    <div style={{position:"relative"}}>
      <MenuButton label="Archivo" open={open==="archivo"} onClick={()=>setOpen(o=>o==="archivo"?null:"archivo")} underline/>
      {open==="archivo"&&<div style={{position:"absolute",top:"100%",left:0,...raised,background:C.winGray,zIndex:500,minWidth:210,paddingTop:2,paddingBottom:2}}>
        <MenuItem label="📥 Exportar backup..." onClick={()=>{onExport();close();}}/>
        <MenuItem label="📤 Importar backup..." onClick={()=>{onImport();close();}}/>
        <MenuSeparator/>
        <MenuItem label="🚪 Cerrar sesión" onClick={()=>{close();onLogout();}} danger/>
      </div>}
    </div>

    {/* ─── VER (todas las secciones) ─── */}
    <div style={{position:"relative"}}>
      <MenuButton label="Ver" open={open==="ver"} onClick={()=>setOpen(o=>o==="ver"?null:"ver")} underline/>
      {open==="ver"&&<div style={{position:"absolute",top:"100%",left:0,...raised,background:C.winGray,zIndex:500,minWidth:230,paddingTop:2,paddingBottom:2}}>
        <MenuItem label={(isActive("usuarios")?"● ":"   ")+"👥 Usuarios (resumen)"} onClick={()=>go("usuarios")}/>
        <MenuItem label={(isActive("docentes")?"● ":"   ")+"👨‍🏫 Docentes"} onClick={()=>go("docentes")}/>
        <MenuSeparator/>
        <MenuItem label={(isActive("sistema")?"● ":"   ")+"⚙️ Sistema"} onClick={()=>go("sistema")}/>
        <MenuItem label={(isActive("historial")?"● ":"   ")+"📜 Historial"} onClick={()=>go("historial")}/>
      </div>}
    </div>

    {/* ─── AYUDA ─── */}
    <div style={{position:"relative"}}>
      <MenuButton label="Ayuda" open={open==="ayuda"} onClick={()=>setOpen(o=>o==="ayuda"?null:"ayuda")} underline/>
      {open==="ayuda"&&<div style={{position:"absolute",top:"100%",left:0,...raised,background:C.winGray,zIndex:500,minWidth:200,paddingTop:2,paddingBottom:2}}>
        <MenuItem label="❓ Atajos y herramientas" onClick={()=>{onHelp();close();}}/>
        <MenuItem label="ℹ️ Acerca de SIMUSID" onClick={()=>{onAbout();close();}}/>
      </div>}
    </div>
  </div>);
}


// ── CONFIG VIEW ──────────────────────────────────────────────────
function ConfigView({store}){
  const lsAvailable=true; // almacenamiento en la nube (Supabase)
  const size=getStorageSize();
  const quota=5*1024*1024; // 5 MB típico
  const pct=Math.min(100,(size/quota)*100);
  const events=Array.isArray(store.events)?store.events.length:0;
  const cotejos=Object.values(store.cotejos||{}).filter(c=>!c.esGuia).length;
  const imagenes=Object.values(store.images||{}).filter(i=>!i.esGuia).length;
  const estudiantes=Object.keys(store.estudiantes||{}).length;
  const docentes=Object.keys(store.docentes||{}).length;
  const Row=({label,value,color})=>(
    <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px dotted ${C.border}`,fontSize:11}}>
      <span style={{color:C.textGray}}>{label}</span>
      <span style={{fontWeight:"bold",color:color||C.text,fontFamily:FONT}}>{value}</span>
    </div>
  );

  return(<>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
      <span style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:C.blue}}>▐ CONFIGURACIÓN DEL SISTEMA</span>
    </div>

    <div style={{...sunken,background:"#fffff0",padding:"8px 12px",marginBottom:14,fontSize:10,color:"#7a6000",lineHeight:1.6}}>
      ℹ Esta sección muestra información técnica del sistema. Las cuentas y contraseñas se gestionan con <b>Supabase Auth</b> (cifradas en el servidor). Para gestionar docentes use <b>Ver → Docentes</b>.
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
      {/* Sistema */}
      <div style={{...raised,background:C.winGray,padding:14}}>
        <div style={{fontSize:11,fontWeight:"bold",color:C.blue,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
          <span>💻</span> SISTEMA
        </div>
        <div style={{...sunken,background:C.white,padding:"8px 12px"}}>
          <Row label="Aplicación" value="SIMUSID v1.0"/>
          <Row label="Almacenamiento" value="Supabase (nube) ✓" color="#006400"/>
          <Row label="Base de datos" value="PostgreSQL + Storage"/>
          <Row label="Eventos en historial" value={`${events} / ${HIST_MAX}`}/>
        </div>
        {!lsAvailable&&<div style={{...sunken,background:"#fff0f0",padding:"6px 10px",marginTop:8,fontSize:10,color:C.red,lineHeight:1.5}}>
          ⚠ El navegador no permite localStorage en este contexto. Los datos se guardan <b>en memoria</b> y se perderán al recargar. Exporte backups con frecuencia.
        </div>}
      </div>

      {/* Almacenamiento */}
      <div style={{...raised,background:C.winGray,padding:14}}>
        <div style={{fontSize:11,fontWeight:"bold",color:C.blue,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
          <span>💾</span> ESPACIO USADO
        </div>
        <div style={{...sunken,background:C.white,padding:"10px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:11,color:C.textGray}}>{formatBytes(size)} usados</span>
            <span style={{fontSize:11,fontWeight:"bold",color:pct>80?C.red:pct>50?C.orange:"#006400"}}>{pct.toFixed(1)}%</span>
          </div>
          <div style={{...sunken,background:"#e8e8e8",height:18,position:"relative",overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,
              background:pct>80?"linear-gradient(90deg,#cc0000,#aa0000)":pct>50?"linear-gradient(90deg,#cc8800,#aa6600)":"linear-gradient(90deg,#006400,#004400)",
              transition:"width 0.3s"}}/>
          </div>
          <div style={{fontSize:9,color:C.textLight,marginTop:6,textAlign:"center"}}>Cuota estimada del navegador: ~5 MB</div>
        </div>
        {pct>80&&<div style={{...sunken,background:"#fff0f0",padding:"6px 10px",marginTop:8,fontSize:10,color:C.red,lineHeight:1.5}}>
          ⚠ Espacio crítico. Considere exportar un backup y limpiar datos antiguos en <b>Datos y Respaldo</b>.
        </div>}
      </div>
    </div>

    {/* Contenido del sistema */}
    <div style={{...raised,background:C.winGray,padding:14,marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:C.blue,marginBottom:10}}>▐ CONTENIDO DEL SISTEMA</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10}}>
        {[
          {l:"Cotejos",v:cotejos,i:"📋"},
          {l:"Imágenes",v:imagenes,i:"🖼️"},
          {l:"Estudiantes",v:estudiantes,i:"🎓"},
          {l:"Docentes",v:docentes,i:"👨‍🏫"},
        ].map((s,i)=>(
          <div key={i} style={{...sunken,background:C.white,padding:"10px 12px",textAlign:"center"}}>
            <div style={{fontSize:22}}>{s.i}</div>
            <div style={{fontSize:22,fontWeight:"bold",color:C.blue,fontFamily:FONT,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:9,color:C.textLight,marginTop:4,fontWeight:"bold",letterSpacing:0.5}}>{s.l.toUpperCase()}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Credenciales */}
    <div style={{...raised,background:C.winGray,padding:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:C.blue,marginBottom:10}}>▐ AUTENTICACIÓN</div>
      <div style={{...sunken,background:C.white,padding:"8px 12px"}}>
        <Row label="🔧 Administrador" value="Email + clave (Supabase Auth)" color={C.blue}/>
        <Row label="👨‍🏫 Docentes" value="Email + clave (Supabase Auth)" color="#006400"/>
        <Row label="🎓 Estudiantes" value="Cédula + clave propia" color="#aa6600"/>
        <Row label="🔒 Contraseñas" value="Hasheadas en el servidor" color={C.orange}/>
      </div>
      <div style={{fontSize:9,color:C.textLight,marginTop:6,fontStyle:"italic"}}>
        La autenticación la gestiona Supabase Auth: contraseñas hasheadas, sesiones con JWT y recuperación por email.
      </div>
    </div>
  </>);
}

// ── DATOS Y RESPALDO VIEW ────────────────────────────────────────
function DatosRespaldoView({store,onExport,onImportClick,importErr,onReset}){
  const size=getStorageSize();
  const cotejos=Object.values(store.cotejos||{}).filter(c=>!c.esGuia).length;
  const imagenes=Object.values(store.images||{}).filter(i=>!i.esGuia).length;
  const estudiantes=Object.keys(store.estudiantes||{}).length;

  return(<>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
      <span style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:C.blue}}>▐ DATOS Y RESPALDO</span>
      <span style={{marginLeft:"auto",fontSize:10,color:C.textGray}}>Tamaño actual: <b style={{color:C.blue}}>{formatBytes(size)}</b></span>
    </div>

    {/* Backup */}
    <div style={{...raised,background:C.winGray,padding:14,marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:"#006400",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
        <span>📥</span> RESPALDO DEL SISTEMA
      </div>
      <div style={{...sunken,background:C.white,padding:"10px 14px",fontSize:11,lineHeight:1.6,marginBottom:10}}>
        Descargue un archivo JSON con <b>todos los datos del sistema</b>: cotejos, imágenes, estudiantes, docentes e historial. Las imágenes guía permanentes se omiten para reducir el tamaño (ya están en el código). Guarde este archivo en un lugar seguro.
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button onClick={onExport} style={{...raised,fontFamily:FONT,fontSize:12,padding:"8px 20px",cursor:"pointer",background:"#006400",color:"#fff",fontWeight:"bold"}}>
          📥 Exportar Backup (.json)
        </button>
        <button onClick={onImportClick} style={{...winBtn(),fontSize:12,padding:"8px 20px",fontWeight:"bold"}}>
          📤 Importar Backup...
        </button>
      </div>
      {importErr&&<div style={{background:"#ffcccc",border:"1px solid #cc0000",padding:"6px 10px",fontSize:10,color:C.red,marginTop:10}}>⚠ {importErr}</div>}
    </div>

    {/* Aviso importante */}
    <div style={{...sunken,background:"#fffff0",padding:"8px 12px",marginBottom:14,fontSize:10,color:"#7a6000",lineHeight:1.6}}>
      💡 <b>Recomendación:</b> exporte un backup antes de cualquier operación destructiva. El localStorage del navegador puede ser limpiado por el usuario o por actualizaciones del sistema sin aviso previo.
    </div>

    {/* Borrado selectivo */}
    <div style={{...raised,background:C.winGray,padding:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:C.red,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
        <span>🗑</span> BORRADO SELECTIVO
      </div>
      <div style={{...sunken,background:"#fff0f0",padding:"8px 12px",fontSize:10,color:"#7a0000",lineHeight:1.6,marginBottom:12}}>
        ⚠ <b>Zona peligrosa.</b> Estas acciones <b>no se pueden deshacer</b>. Exporte un backup primero.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
        {[
          {cat:"cotejos",l:"Borrar Cotejos",sub:`${cotejos} cotejo${cotejos===1?"":"s"} se eliminarán`,i:"📋"},
          {cat:"imagenes",l:"Borrar Imágenes",sub:`${imagenes} imagen${imagenes===1?"":"es"} se eliminarán`,i:"🖼️"},
          {cat:"estudiantes",l:"Borrar Estudiantes",sub:`${estudiantes} estudiante${estudiantes===1?"":"s"} + sus cotejos`,i:"🎓"},
          {cat:"todo",l:"BORRAR TODO",sub:"Reinicio completo del sistema",i:"💥",danger:true},
        ].map(b=>(
          <button key={b.cat} onClick={()=>onReset(b.cat)} style={{
            ...raised,background:b.danger?"#aa0000":C.winGray,color:b.danger?"#fff":C.text,
            padding:"12px 10px",cursor:"pointer",fontFamily:FONT,textAlign:"center",display:"flex",flexDirection:"column",gap:4
          }}>
            <span style={{fontSize:24}}>{b.i}</span>
            <span style={{fontSize:11,fontWeight:"bold",color:b.danger?"#fff":C.red}}>{b.l}</span>
            <span style={{fontSize:9,color:b.danger?"#fee":C.textLight}}>{b.sub}</span>
          </button>
        ))}
      </div>
    </div>
  </>);
}

// ── HISTORIAL VIEW ───────────────────────────────────────────────
function HistorialView({store,filter,onFilter}){
  const events=Array.isArray(store.events)?store.events:[];
  const counts={
    todos:events.length,
    cotejo:events.filter(e=>e.category==="cotejo").length,
    imagen:events.filter(e=>e.category==="imagen").length,
    usuario:events.filter(e=>e.category==="usuario").length,
    login:events.filter(e=>e.category==="login").length,
    sistema:events.filter(e=>e.category==="sistema").length,
  };
  const visible=filter==="todos"?events:events.filter(e=>e.category===filter);
  const catStyle={
    cotejo:{color:C.blue,bg:"#e0e8f0",icon:"📋",label:"COTEJO"},
    imagen:{color:"#7a6000",bg:"#fffff0",icon:"🖼️",label:"IMAGEN"},
    usuario:{color:"#006400",bg:"#e8f0e8",icon:"👤",label:"USUARIO"},
    login:{color:"#660066",bg:"#f0e8f0",icon:"🔑",label:"LOGIN"},
    sistema:{color:C.red,bg:"#f0e8e8",icon:"⚙️",label:"SISTEMA"},
  };

  return(<>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <span style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:C.blue}}>▐ HISTORIAL DE ACTIVIDAD</span>
      <span style={{fontSize:10,color:C.textLight}}>({events.length} evento{events.length===1?"":"s"} · máx. {HIST_MAX})</span>
    </div>

    {/* Filtros */}
    <div style={{display:"flex",gap:3,marginBottom:12,flexWrap:"wrap"}}>
      {[
        {k:"todos",l:`Todos (${counts.todos})`},
        {k:"cotejo",l:`📋 Cotejos (${counts.cotejo})`},
        {k:"imagen",l:`🖼️ Imágenes (${counts.imagen})`},
        {k:"usuario",l:`👤 Usuarios (${counts.usuario})`},
        {k:"login",l:`🔑 Logins (${counts.login})`},
        {k:"sistema",l:`⚙️ Sistema (${counts.sistema})`},
      ].map(f=>(
        <button key={f.k} onClick={()=>onFilter(f.k)} style={{...winBtn(filter===f.k),fontSize:10,padding:"3px 10px"}}>{f.l}</button>
      ))}
    </div>

    {/* Lista de eventos */}
    {visible.length===0?
      <div style={{...sunken,background:C.white,padding:40,textAlign:"center",color:C.textLight,fontSize:11}}>
        {events.length===0?"No hay eventos registrados todavía. Las acciones que realice aparecerán aquí.":"No hay eventos en esta categoría."}
      </div>
      :<div style={{...sunken,background:C.white,padding:0,maxHeight:520,overflowY:"auto"}}>
        {visible.map(ev=>{
          const cs=catStyle[ev.category]||catStyle.sistema;
          return(<div key={ev.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",borderBottom:`1px solid #eee`,background:cs.bg}}>
            <div style={{width:24,fontSize:14,textAlign:"center",flexShrink:0}}>{cs.icon}</div>
            <div style={{...sunken,background:"#fff",padding:"1px 6px",fontSize:8,fontWeight:"bold",color:cs.color,letterSpacing:0.5,minWidth:64,textAlign:"center",flexShrink:0}}>{cs.label}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ev.detail}</div>
              <div style={{fontSize:9,color:C.textLight}}>
                <span style={{fontWeight:"bold"}}>{ev.action}</span> · por <b>{ev.actor}</b>
              </div>
            </div>
            <div style={{fontSize:9,color:C.textGray,fontFamily:FONT,flexShrink:0,textAlign:"right",lineHeight:1.3}}>{ev.date}</div>
          </div>);
        })}
      </div>
    }
  </>);
}

// ── LIVE CLOCK ────────────────────────────────────────────────────
function LiveClock(){
  const [t,setT]=useState(()=>new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}));
  useEffect(()=>{const id=setInterval(()=>setT(new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})),1000);return()=>clearInterval(id);},[]);
  return <span style={{...sunken,background:C.winGray,padding:"1px 8px",fontSize:10,fontWeight:"bold",color:C.text,fontFamily:FONT,letterSpacing:1,minWidth:66,display:"inline-block",textAlign:"center"}}>{t}</span>;
}

// ── FP LOGO ───────────────────────────────────────────────────────
const FpLogo=({size=28,stroke="#fff"})=>(
  <svg width={size} height={size} viewBox="0 0 28 28" style={{flexShrink:0}}>
    <circle cx="14" cy="14" r="2" fill="none" stroke={stroke} strokeWidth="1.8"/>
    <path d="M 9 14 a 5 5 0 0 1 10 0" fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M 7 14 a 7 7 0 0 1 14 0" fill="none" stroke={stroke} strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M 5 14 a 9 9 0 0 1 18 0" fill="none" stroke={stroke} strokeWidth="1.0" strokeLinecap="round"/>
    <path d="M 3 14 a 11 11 0 0 1 22 0" fill="none" stroke={stroke} strokeWidth="0.8" strokeLinecap="round"/>
    <path d="M 10 20 a 6 6 0 0 0 8 0" fill="none" stroke={stroke} strokeWidth="1.0" strokeLinecap="round"/>
    <path d="M  8 22 a 8 8 0 0 0 12 0" fill="none" stroke={stroke} strokeWidth="0.8" strokeLinecap="round"/>
  </svg>
);

// ── LOGIN SCREEN ──────────────────────────────────────────────────
function LoginScreen({onLogin}){
  const [user,setUser]=useState(""),[pass,setPass]=useState(""),[role,setRole]=useState("admin"),[err,setErr]=useState(""),[loading,setLoading]=useState(false);
  const [logLines,setLogLines]=useState([]);
  const [logResult,setLogResult]=useState(null); // null | 'success' | 'fail'
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const runSequence=async(isValid,onSuccessCb)=>{
    setLoading(true);
    setLogResult(null);
    setLogLines(["> Conectando con SIMUSID V1.0..."]);
    await sleep(750);
    setLogLines(prev=>[...prev,"> Verificando credencial..."]);
    await sleep(950);
    if(isValid){
      setLogLines(prev=>[...prev,"> ...correcta. Acceso autorizado."]);
      setLogResult("success");
      await sleep(750);
      setLoading(false);
      onSuccessCb();
    } else {
      setLogLines(prev=>[...prev,"> ...fallo. Acceso denegado."]);
      setLogResult("fail");
      await sleep(2200);
      setLoading(false);
      setLogLines([]);
      setLogResult(null);
    }
  };

  const handle=()=>{
    if(loading) return;
    if(!user||!pass||!role){setErr("Complete todos los campos.");setTimeout(()=>setErr(""),3000);return;}
    setErr("");
    (async()=>{
      setLoading(true);setLogResult(null);
      setLogLines(["> Conectando con SIMUSID v2.0..."]);
      await sleep(600);
      setLogLines(p=>[...p,"> Verificando credencial con el servidor..."]);
      try{
        const prof=await api.signIn(role,user.trim(),pass);
        setLogLines(p=>[...p,"> ...correcta. Acceso autorizado."]);setLogResult("success");
        api.logEvent("login","login_ok",`${prof.nombre||user} ingresó como ${role}`,prof.cedula||prof.nombre||user);
        await sleep(600);
        setLoading(false);
        if(role==="estudiante") onLogin("estudiante",{cedula:prof.cedula,nombre:prof.nombre,apellido:prof.apellido});
        else onLogin(role);
      }catch(e){
        setLogLines(p=>[...p,`> ...fallo. ${e.message||"Acceso denegado."}`]);setLogResult("fail");
        await sleep(2200);
        setLoading(false);setLogLines([]);setLogResult(null);
      }
    })();
  };
  return(
    <div style={{background:C.winGray2,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,backgroundImage:"radial-gradient(#a8a09868 1px,transparent 1px)",backgroundSize:"18px 18px"}}>
      <div style={{...raised,background:C.winGray,width:360,maxWidth:"95vw"}}>
        <div style={{...titleBarStyle,fontSize:13,padding:"5px 10px"}}>
          <FpLogo size={26} stroke="#fff"/><span>SIMUSID — Inicio de Sesión</span>
          <div style={{marginLeft:"auto",display:"flex",gap:3}}>{["_","□","✕"].map(b=>(<button key={b} style={{...winBtn(),minWidth:18,padding:"0 4px",fontSize:10,lineHeight:1}}>{b}</button>))}</div>
        </div>
        <div style={{textAlign:"center",padding:"22px 0 14px",background:C.winGray,borderBottom:`1px solid ${C.border}`}}>
          <FpLogo size={66} stroke={C.blue}/>
          <div style={{fontWeight:"bold",fontSize:16,color:C.blue,letterSpacing:4,marginTop:8}}>SIMUSID</div>
          <div style={{fontSize:9,color:C.textLight,letterSpacing:2,marginTop:2}}>SISTEMA DE IDENTIFICACIÓN DACTILOSCÓPICA</div>
        </div>
        <div style={{padding:"18px 28px 14px",display:"flex",flexDirection:"column",gap:12}}>
          <div style={{...sunken,background:"#e8e0d8",padding:"6px 10px",fontSize:10,color:C.textGray,textAlign:"center",letterSpacing:1}}>ACCESO RESTRINGIDO — PERSONAL AUTORIZADO</div>
          {[{l:"Usuario:",v:user,s:setUser,t:"text",p:"Ingrese su usuario"},{l:"Contraseña:",v:pass,s:setPass,t:"password",p:"Ingrese su contraseña"}].map(f=>(
            <div key={f.l} style={{display:"grid",gridTemplateColumns:"100px 1fr",alignItems:"center",gap:8}}>
              <label style={{fontSize:11,fontWeight:"bold",textAlign:"right"}}>{f.l}</label>
              <input type={f.t} value={f.v} onChange={e=>f.s(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder={f.p} autoComplete="off"
                style={{...sunken,fontFamily:FONT,fontSize:12,padding:"4px 8px",color:C.text,outline:"none",background:C.white}}/>
            </div>
          ))}
          <div style={{display:"grid",gridTemplateColumns:"100px 1fr",alignItems:"center",gap:8}}>
            <label style={{fontSize:11,fontWeight:"bold",textAlign:"right"}}>Tipo:</label>
            <select value={role} onChange={e=>setRole(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}
              style={{...sunken,fontFamily:FONT,fontSize:12,padding:"4px 8px",color:C.text,outline:"none",background:C.white,cursor:"pointer"}}>
              <option value="admin">Administrador</option>
              <option value="docente">Docente</option>
              <option value="estudiante">Estudiante</option>
            </select>
          </div>
          {err&&<div style={{background:"#ffcccc",border:"1px solid #cc0000",padding:"5px 10px",fontSize:10,color:C.red,textAlign:"center"}}>{err}</div>}
          <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:4}}>
            <button onClick={handle} disabled={loading} style={{...raised,fontFamily:FONT,fontSize:12,fontWeight:"bold",padding:"6px 28px",cursor:loading?"wait":"pointer",color:loading?C.textLight:C.text,background:C.winGray,minWidth:120}}>{loading?"Verificando...":"▶ Ingresar"}</button>
            <button onClick={()=>{setUser("");setPass("");setErr("");}} style={{...winBtn(),fontSize:11,padding:"6px 16px"}}>Limpiar</button>
          </div>
          {logLines.length>0&&(
            <div style={{...sunken,background:C.white,padding:"8px 10px",fontFamily:"'Courier New',Courier,monospace",fontSize:11,lineHeight:1.45,minHeight:62,marginTop:2}}>
              {logLines.map((line,i)=>{
                const isLast=i===logLines.length-1;
                let color=C.blue; // azul primario para líneas en progreso
                if(isLast&&logResult==="success") color=C.green;
                if(isLast&&logResult==="fail") color=C.red;
                const showCursor=isLast&&logResult===null;
                return(
                  <div key={i} style={{color,letterSpacing:0.3,fontWeight:isLast&&logResult?"bold":"normal"}}>
                    {line}{showCursor&&<span style={{marginLeft:2}}>▌</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{background:C.winGray2,borderTop:`1px solid ${C.border}`,padding:"3px 12px",display:"flex",gap:10,alignItems:"center"}}>
          <div style={{...sunken,padding:"1px 8px",fontSize:9,color:loading?C.blue:C.textLight,flex:1}}>{loading?"Verificando credenciales...":"Listo"}</div>
          <LiveClock/>
          <span style={{fontSize:9,color:C.textLight}}>SIMUSID v1.0</span>
        </div>
      </div>
      <div style={{marginTop:10,fontSize:9,color:C.textGray,fontFamily:FONT}}>ENTORNO ACADÉMICO DE PRÁCTICA</div>
    </div>
  );
}

// ── GRÁFICO DE SUFICIENCIA (SWGFAST #10, Figura 1) ────────────────
// Material de estudio interactivo para la fase A. Cruza CALIDAD (eje Y, Tabla 1)
// con CANTIDAD de minucias (eje X). Define tres zonas:
//   A (rojo) = por debajo de la curva sólida → no se justifica individualización.
//   B (amarillo) = sobre la curva pero antes de la punteada → complejo, puede justificarse.
//   C (verde) = sobre la curva punteada → no complejo, se justifica.
// REGLA CLAVE (6.4.1.6): la cantidad no tiene sentido sin calidad; el número NO decide solo.
function GraficoSuficiencia({calidad,recuento}){
  // Geometría del gráfico
  const W=420,H=300, padL=64,padB=42,padT=14,padR=14;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const maxMin=16;
  // Calidad → fila (0 abajo = Baja ... 3 arriba = Alta), centrada en su banda.
  // Las 4 categorías del selector (Tabla 1) mapean 1:1 a las 4 bandas del gráfico.
  const calRow={baja:0,media_baja:1,media_alta:2,alta:3};
  const filas=["Baja","Media-baja","Media-alta","Alta"]; // de abajo hacia arriba
  // Recuento → nº de minucias para posicionar en X, coherente con los rangos
  // del selector de Nivel 2: pocos (<8), medios (8–15), muchos (>15).
  const recMin={pocos:4,medios:11,muchos:16};
  const qy=(row)=> padT + plotH - ((row+0.5)/4)*plotH;       // y del centro de la banda
  const mx=(m)=> padL + (Math.min(m,maxMin)/maxMin)*plotW;   // x de una cantidad de minucias
  // Curva sólida de suficiencia (límite inferior, área A debajo): y = f(x) decreciente.
  // Aproximación de la Figura 1: alta a la izquierda, baja a la derecha.
  const curvaSolida=(x)=>{ const t=x/maxMin; return padT + Math.pow(1-t,1.7)*plotH*0.92 + plotH*0.04; };
  const curvaPunteada=(x)=>{ const t=x/maxMin; return padT + Math.pow(1-t,1.3)*plotH*0.72; };
  // Construir paths
  let solidPts=[], dotPts=[];
  for(let i=0;i<=40;i++){ const x=padL+(i/40)*plotW; const m=(i/40)*maxMin;
    solidPts.push(`${x.toFixed(1)},${curvaSolida(m).toFixed(1)}`);
    dotPts.push(`${x.toFixed(1)},${curvaPunteada(m).toFixed(1)}`);
  }
  // Posición del marcador de la huella (si hay calidad y recuento)
  const tieneDatos = !!calidad && !!recuento;
  const row = calRow[calidad] ?? null;
  const m = recMin[recuento] ?? null;
  let markX=null, markY=null, zona=null;
  if(tieneDatos && row!=null && m!=null){
    markX=mx(m); markY=qy(row);
    const ys=curvaSolida(m), yp=curvaPunteada(m);
    // menor Y = más arriba = mejor. Si el marcador está por encima (Y menor) de la curva sólida → sobre la curva.
    if(markY>ys) zona="A"; else if(markY>yp) zona="B"; else zona="C";
  }
  const zonaInfo={
    A:{c:"#aa0000",t:"Zona A — Insuficiente",d:"Por debajo de la curva: no se justifica una individualización con esta combinación. Recuerde que una calidad muy alta puede mover la huella fuera de esta zona aun con pocas minucias (apdo. 6.4.1.6)."},
    B:{c:"#9a7b00",t:"Zona B — Complejo",d:"Sobre la curva, examen complejo: puede justificarse una individualización con documentación ampliada y verificación reforzada (Tabla 2)."},
    C:{c:"#1a7a1a",t:"Zona C — No complejo",d:"Sobre la curva punteada: examen no complejo, se justifica una individualización con documentación y verificación estándar."},
  };
  return(
    <div style={{...raised,background:"#fbfbf7",padding:"10px 12px"}}>
      <div style={{fontSize:11,fontWeight:"bold",color:C.blue,marginBottom:2}}>📊 GRÁFICO DE SUFICIENCIA <span style={{fontSize:9,fontWeight:"normal",color:C.textGray}}>— material de estudio (SWGFAST #10, Fig. 1)</span></div>
      <div style={{fontSize:9,color:C.textGray,marginBottom:8,lineHeight:1.5}}>Cruza la <b>calidad</b> (que eligió arriba) con la <b>cantidad de minucias</b> observada. Sirve para razonar la idoneidad — no es una fórmula.</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block",background:"#fff",border:`1px solid ${C.border}`}}>
        {/* Bandas de fondo por zona (degradado simple por celdas) */}
        <defs>
          <linearGradient id="gsBg" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#e9b3b3"/>
            <stop offset="38%" stopColor="#f0d9a0"/>
            <stop offset="70%" stopColor="#dCe8a8"/>
            <stop offset="100%" stopColor="#bfe0b0"/>
          </linearGradient>
        </defs>
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="url(#gsBg)"/>
        {/* Líneas de cuadrícula horizontales (4 bandas de calidad) */}
        {filas.map((f,i)=>{ const y=padT+plotH-((i+1)/4)*plotH; return(
          <g key={f}>
            <line x1={padL} y1={y} x2={padL+plotW} y2={y} stroke="#0001" strokeWidth="1"/>
            <text x={padL-6} y={qy(i)+3} textAnchor="end" fontSize="9" fontFamily="monospace" fill="#333">{f}</text>
          </g>
        );})}
        {/* Marcas eje X */}
        {[0,2,4,6,8,10,12,14,16].map(t=>(
          <g key={t}>
            <line x1={mx(t)} y1={padT+plotH} x2={mx(t)} y2={padT+plotH+4} stroke="#333" strokeWidth="1"/>
            <text x={mx(t)} y={padT+plotH+15} textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#333">{t}</text>
          </g>
        ))}
        {/* Etiquetas de zona */}
        <text x={mx(1.4)} y={qy(0)+4} fontSize="15" fontWeight="bold" fill="#7a0000">A</text>
        <text x={mx(5)} y={qy(2)+4} fontSize="15" fontWeight="bold" fill="#6a5400">B</text>
        <text x={mx(14)} y={qy(3)+4} fontSize="15" fontWeight="bold" fill="#0f5a0f">C</text>
        {/* Curva sólida (límite de suficiencia) */}
        <polyline points={solidPts.join(" ")} fill="none" stroke="#7a1f1f" strokeWidth="2.5"/>
        {/* Curva punteada (complejo vs no complejo) */}
        <polyline points={dotPts.join(" ")} fill="none" stroke="#33408a" strokeWidth="1.8" strokeDasharray="2 4"/>
        {/* Ejes */}
        <line x1={padL} y1={padT} x2={padL} y2={padT+plotH} stroke="#000" strokeWidth="1.5"/>
        <line x1={padL} y1={padT+plotH} x2={padL+plotW} y2={padT+plotH} stroke="#000" strokeWidth="1.5"/>
        <text x={padL+plotW/2} y={H-4} textAnchor="middle" fontSize="9.5" fontFamily="monospace" fill="#000">Cantidad de minucias</text>
        <text x={14} y={padT+plotH/2} textAnchor="middle" fontSize="9.5" fontFamily="monospace" fill="#000" transform={`rotate(-90 14 ${padT+plotH/2})`}>Calidad</text>
        {/* Marcador de la huella analizada */}
        {markX!=null && (
          <g>
            <line x1={markX} y1={padT} x2={markX} y2={padT+plotH} stroke="#0008" strokeWidth="0.8" strokeDasharray="2 2"/>
            <line x1={padL} y1={markY} x2={padL+plotW} y2={markY} stroke="#0008" strokeWidth="0.8" strokeDasharray="2 2"/>
            <circle cx={markX} cy={markY} r="7" fill="#fff" stroke="#000" strokeWidth="2"/>
            <circle cx={markX} cy={markY} r="3" fill={zona?zonaInfo[zona].c:"#000"}/>
          </g>
        )}
      </svg>
      {/* Lectura del marcador */}
      {tieneDatos
        ? (zona && <div style={{...sunken,background:"#fff",padding:"6px 10px",marginTop:8,fontSize:10,lineHeight:1.5,borderLeft:`4px solid ${zonaInfo[zona].c}`}}>
            <b style={{color:zonaInfo[zona].c}}>{zonaInfo[zona].t}.</b> <span style={{color:C.textGray}}>{zonaInfo[zona].d}</span>
          </div>)
        : <div style={{...sunken,background:"#fffff0",padding:"6px 10px",marginTop:8,fontSize:9,color:"#7a6000",fontStyle:"italic"}}>Elija la <b>calidad</b> y el <b>recuento de minucias (Nivel 2)</b> arriba para situar la huella en el gráfico.</div>}
      <div style={{fontSize:8,color:C.textGray,fontStyle:"italic",marginTop:6,lineHeight:1.5,textAlign:"center"}}>
        La cantidad no tiene sentido en ausencia de calidad. Este gráfico no respalda el uso de minucias como único criterio de decisión (apdo. 6.4.1.6).
      </div>
    </div>
  );
}

// ── COMPARE SCREEN ────────────────────────────────────────────────
function CompareScreen({cotejoId,onBack,onLogout}){
  const [store,setStore]=useState(()=>loadStore());
  const cotejo=store.cotejos?.[cotejoId],images=store.images||{};
  const isReadOnly=cotejo?.status==="entregado"||cotejo?.status==="calificado";
  // ── Cotejo modelo del docente: estado de finalización ──
  // El docente trabaja "en progreso" (autoguardado) y debe FINALIZAR el cotejo
  // para poder publicarlo a los estudiantes. Reabrirlo lo regresa a progreso.
  const esModeloDocente=cotejo?.owner==="docente"&&!cotejo?.esGuia;
  const esCotejoEstudiante=cotejo?.owner==="estudiante"&&!cotejo?.modoLibre;
  const [finalizado,setFinalizado]=useState(!!cotejo?.finalizado);
  const [leftShapes,setLeftShapes]=useState(cotejo?.leftShapes||[]);
  const [rightShapes,setRightShapes]=useState(cotejo?.rightShapes||[]);
  const [tool,setTool]=useState("circle"),[color,setColor]=useState(C.blue);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [lZoom,setLZoom]=useState(1),[rZoom,setRZoom]=useState(1),[syncZoom,setSyncZoom]=useState(false);
  const leftPanelRef=useRef(null),rightPanelRef=useRef(null);
  const handleSyncWheel=useCallback((origin,panelMx,panelMy,newZoom)=>{
    const other=origin==="left"?rightPanelRef.current:leftPanelRef.current;
    if(other&&typeof other.applySyncZoomAt==="function"){
      other.applySyncZoomAt(panelMx,panelMy,newZoom);
    }
  },[]);
  const [lHist,setLHist]=useState([]),lRedo=useRef([]);
  const [rHist,setRHist]=useState([]),rRedo=useRef([]);
  const [maxLabel,setMaxLabel]=useState(cotejo?.maxLabel||1),[curLabel,setCurLabel]=useState(cotejo?.currentLabel||1),[pendSide,setPendSide]=useState(null);
  const [showNotes,setShowNotes]=useState(false),[showColor,setShowColor]=useState(false),[hoveredColor,setHoveredColor]=useState(null);
  const [showPoints,setShowPoints]=useState(false);
  const [noteCaso,setNoteCaso]=useState(cotejo?.noteCaso||""),[notePerito,setNotePerito]=useState(cotejo?.notePerito||"");
  const [noteFecha,setNoteFecha]=useState(cotejo?.noteFecha||""),[noteObs,setNoteObs]=useState(cotejo?.noteObs||"");
  // noteTipo: el tipo de dactilograma ahora se captura por huella en Nivel 1 (ficha).
  // Se conserva el estado para compatibilidad con cotejos guardados y el PDF de respaldo.
  const [noteTipo]=useState(cotejo?.noteTipo||"");
  // ── ACE-V: Estado de cada fase ─────────────────────────────────
  // A — Análisis: observaciones individuales por muestra (sin comparar)
  // analisisA/B: las observaciones libres por huella salieron de la UI en esta
  // versión; el estado se conserva para compatibilidad con cotejos guardados.
  const [analisisA]=useState(cotejo?.analisisA||"");
  const [analisisB]=useState(cotejo?.analisisB||"");
  // ── A — FICHA ESTRUCTURADA (modelo integrador embebido) ────────
  // Sub-flujo A.1 (dubitada) → A.2 (indubitada) → A.3 (aptitud).
  // Cada huella registra los 3 niveles de detalle.
  const fichaVacia=()=>({
    // Nivel 1 — tipo de dactilograma (Henry Canadiense)
    n1diseno:"",            // Arco | Presilla radial | Verticilo | ...
    // Nivel 2 — recuento de puntos característicos
    n2recuento:"",          // pocos | medios | muchos
    // Nivel 3 — poros y bordes de cresta
    n3poros:"",             // no | si | dudoso
    n3bordes:"",            // no | si | dudoso
  });
  const [fichaA,setFichaA]=useState(cotejo?.fichaA||fichaVacia());   // dubitada
  const [fichaB,setFichaB]=useState(cotejo?.fichaB||fichaVacia());   // indubitada
  // Sub-paso del análisis a ciegas: "A1" (dubitada) | "A2" (indubitada) | "A3" (aptitud)
  const [subPasoA,setSubPasoA]=useState(cotejo?.subPasoA||"A1");
  // Confirmaciones del análisis a ciegas (bloquean edición y revelan la otra huella)
  const [confirmadoA1,setConfirmadoA1]=useState(cotejo?.confirmadoA1||false);
  const [confirmadoA2,setConfirmadoA2]=useState(cotejo?.confirmadoA2||false);
  // A.3 — Decisión de aptitud por huella: "apta" | "no_apta" | ""
  const [aptitudA,setAptitudA]=useState(cotejo?.aptitudA||"");
  const [aptitudB,setAptitudB]=useState(cotejo?.aptitudB||"");
  // Confirmación de la fase A completa (queda solo lectura) y veto en origen
  const [confirmadoA,setConfirmadoA]=useState(cotejo?.confirmadoA||false);
  const [vetoEnOrigen,setVetoEnOrigen]=useState(cotejo?.vetoEnOrigen||false);
  // ── C — Comparación: registro de diferencias ──────────────────
  // Cada diferencia: {id, label, descripcion, explicada(bool), alteracion(string que cita una alteración de A)}
  const [diferencias,setDiferencias]=useState(cotejo?.diferencias||[]);
  const [confirmadoC,setConfirmadoC]=useState(cotejo?.confirmadoC||false);
  // E — Evaluación: conclusión + justificación
  const [conclusion,setConclusion]=useState(cotejo?.conclusion||""); // "identificacion" | "exclusion" | "inconcluso"
  const [justificacion,setJustificacion]=useState(cotejo?.justificacion||"");
  // E — "Dar la vuelta al argumento" (8.8): respuestas de autocrítica obligatoria
  const [autocriticaE,setAutocriticaE]=useState(cotejo?.autocriticaE||{q1:"",q2:"",q3:""});
  // Fase actual del flujo (A/C/E). V se accede tras entregar desde Completados.
  // MODO PRÁCTICA LIBRE: cuando el cotejo tiene modoLibre, se omite el flujo ACE-V
  // estricto (sin fases bloqueadas, veto, aptitud ni entrega). El estudiante marca
  // minucias libremente sobre ambas huellas. Pensado para practicar solo.
  const modoLibre = !!cotejo?.modoLibre;
  const [faseACEV,setFaseACEV]=useState(modoLibre?"C":"A");
  const [pointNames,setPointNames]=useState(cotejo?.pointNames||Array(10).fill(""));
  const [savedMsg,setSavedMsg]=useState("");
  const [showHelp,setShowHelp]=useState(false);
  const [showLayers,setShowLayers]=useState(false);
  const [layers,setLayers]=useState({images:true,quality:true,minucias:true,crestas:true,labels:true});
  const defF={brightness:100,contrast:100,bw:false,invert:false,vucsa:false,ridge:false,flipH:false,flipV:false,rotate:0};
  const [fA,setFA]=useState({...defF}),[fB,setFB]=useState({...defF});
  const setLRedo=(v)=>{lRedo.current=typeof v==="function"?v(lRedo.current):v;};
  const setRRedo=(v)=>{rRedo.current=typeof v==="function"?v(rRedo.current):v;};

  const allLabels=Array.from({length:maxLabel-1},(_,i)=>String(i+1));
  const missingA=allLabels.filter(l=>!leftShapes.some(s=>s.label===l));
  const missingB=allLabels.filter(l=>!rightShapes.some(s=>s.label===l));
  const matched=allLabels.filter(l=>leftShapes.some(s=>s.label===l)&&rightShapes.some(s=>s.label===l)).length;

  const onShapePlaced=useCallback((side)=>{if(tool==="select"||tool==="pan"||tool==="quality"||tool==="crestas")return;if(side==="left")setPendSide("left");else{if(pendSide==="left"){setMaxLabel(n=>Math.max(n,curLabel+1));setCurLabel(n=>n+1);setPendSide(null);}}},[tool,pendSide,curLabel]);
  const fixLabel=(lbl,side)=>{setCurLabel(Number(lbl));if(side==="A")setPendSide(null);else setPendSide("left");};
  const setZoom=(v,w)=>{if(w==="both"){setLZoom(v);setRZoom(v);}else if(w==="left")setLZoom(v);else setRZoom(v);};
  const undo=useCallback(()=>{if(lHist.length){setLRedo(r=>[leftShapes,...r]);setLeftShapes(lHist[lHist.length-1]);setLHist(h=>h.slice(0,-1));}if(rHist.length){setRRedo(r=>[rightShapes,...r]);setRightShapes(rHist[rHist.length-1]);setRHist(h=>h.slice(0,-1));}},[leftShapes,rightShapes,lHist,rHist]);
  const redo=useCallback(()=>{if(lRedo.current.length){setLHist(h=>[...h,leftShapes]);setLeftShapes(lRedo.current[0]);setLRedo(r=>r.slice(1));}if(rRedo.current.length){setRHist(h=>[...h,rightShapes]);setRightShapes(rRedo.current[0]);setRRedo(r=>r.slice(1));}},[leftShapes,rightShapes]);
  const handleSave=useCallback(()=>{const u={...loadStore()};if(!u.cotejos)u.cotejos={};u.cotejos[cotejoId]={...u.cotejos[cotejoId],leftShapes,rightShapes,maxLabel,currentLabel:curLabel,noteCaso,notePerito,noteFecha,noteObs,noteTipo,analisisA,analisisB,conclusion,justificacion,pointNames,fichaA,fichaB,subPasoA,confirmadoA1,confirmadoA2,aptitudA,aptitudB,confirmadoA,vetoEnOrigen,diferencias,confirmadoC,autocriticaE};saveStore(u);setStore(u);setSavedMsg("✓ Guardado");setTimeout(()=>setSavedMsg(""),2000);},[leftShapes,rightShapes,maxLabel,curLabel,noteCaso,notePerito,noteFecha,noteObs,noteTipo,analisisA,analisisB,conclusion,justificacion,pointNames,fichaA,fichaB,subPasoA,confirmadoA1,confirmadoA2,aptitudA,aptitudB,confirmadoA,vetoEnOrigen,diferencias,confirmadoC,autocriticaE]);
  // ── Finalizar / Reabrir cotejo modelo (solo docente) ──
  const finalizarModelo=()=>{
    const u={...loadStore()};if(!u.cotejos)u.cotejos={};
    u.cotejos[cotejoId]={...u.cotejos[cotejoId],leftShapes,rightShapes,maxLabel,currentLabel:curLabel,noteCaso,notePerito,noteFecha,noteObs,noteTipo,analisisA,analisisB,conclusion,justificacion,pointNames,fichaA,fichaB,subPasoA,confirmadoA1,confirmadoA2,aptitudA,aptitudB,confirmadoA,vetoEnOrigen,diferencias,confirmadoC,autocriticaE,finalizado:true,finalizadoAt:now()};
    saveStore(u);setStore(u);setFinalizado(true);
    logEvent("cotejo","finalizar",`Cotejo modelo "${cotejo?.name}" finalizado por el docente`,"docente");
    setSavedMsg("✓ Cotejo finalizado — ya puede publicarlo");setTimeout(()=>setSavedMsg(""),3000);
  };
  const reabrirModelo=()=>{
    const u={...loadStore()};if(!u.cotejos)u.cotejos={};
    const estabaPublicado=!!u.cotejos[cotejoId]?.published;
    u.cotejos[cotejoId]={...u.cotejos[cotejoId],finalizado:false,published:false};
    saveStore(u);setStore(u);setFinalizado(false);
    logEvent("cotejo","reabrir",`Cotejo modelo "${cotejo?.name}" reabierto para edición${estabaPublicado?" (despublicado)":""}`,"docente");
    setSavedMsg(estabaPublicado?"✏ Reabierto y despublicado":"✏ Reabierto para edición");setTimeout(()=>setSavedMsg(""),3000);
  };
  // ── Entregar el cotejo directamente desde el editor (estudiante) ──
  const entregarDesdeEditor=()=>{
    if(isReadOnly||!esCotejoEstudiante) return;
    if(matched===0){setSavedMsg("⚠ Marque al menos 1 par de puntos en ambas muestras");setTimeout(()=>setSavedMsg(""),4000);return;}
    const all=loadStore().cotejos||{};
    const parent=cotejo?.parentId?all[cotejo.parentId]:null;
    let isLate=false;
    if(parent?.deadline){
      const dl=new Date(parent.deadline+"T23:59:59");
      if(new Date()>dl){
        if(parent.deadlineStrict){setSavedMsg("🔒 Plazo vencido (modo estricto): no se puede entregar");setTimeout(()=>setSavedMsg(""),5000);return;}
        isLate=true;
      }
    }
    if(!window.confirm(`¿Entregar el cotejo "${cotejo?.name}"?\n\nDespués de entregarlo NO podrá modificarlo.${isLate?"\n⚠ El plazo venció: quedará como entrega tardía.":""}`)) return;
    const u={...loadStore()};if(!u.cotejos)u.cotejos={};
    u.cotejos[cotejoId]={...u.cotejos[cotejoId],leftShapes,rightShapes,maxLabel,currentLabel:curLabel,noteCaso,notePerito,noteFecha,noteObs,noteTipo,analisisA,analisisB,conclusion,justificacion,pointNames,fichaA,fichaB,subPasoA,confirmadoA1,confirmadoA2,aptitudA,aptitudB,confirmadoA,vetoEnOrigen,diferencias,confirmadoC,autocriticaE,status:"entregado",submittedAt:now(),lateSubmission:isLate};
    saveStore(u);
    logEvent("cotejo","entregar",`Cotejo "${cotejo?.name}" entregado desde el editor con ${matched} par(es)${isLate?" (TARDÍA)":""}`,cotejo?.studentId||"estudiante");
    onBack();
  };
  useEffect(()=>{const h=(e)=>{if((e.ctrlKey||e.metaKey)&&e.key==="z"){e.preventDefault();undo();}if((e.ctrlKey||e.metaKey)&&e.key==="y"){e.preventDefault();redo();}if((e.ctrlKey||e.metaKey)&&e.key==="s"){e.preventDefault();if(!isReadOnly)handleSave();}};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[undo,redo,handleSave,isReadOnly]);
  const hasMissing=missingA.length>0||missingB.length>0;
  const imgAS=images[cotejo?.imgA]?.src,imgBS=images[cotejo?.imgB]?.src;

  const SbBtn=(id,icon,lbl)=>(<button key={id} onClick={()=>setTool(id)} style={{...raised,background:tool===id?C.winGray3:C.winGray,width:50,height:44,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}}>
    <span style={{fontSize:15,color:tool===id?C.blue:C.textGray}}>{icon}</span>
    <span style={{fontSize:7,fontFamily:FONT,color:tool===id?C.blue:C.textGray,letterSpacing:0.5}}>{lbl}</span>
  </button>);

  // ── ACE-V: validación de completitud por fase ─────────────────
  // Pedagógicamente fuerza la SECUENCIA metodológica del cotejo dactiloscópico.
  // El estudiante NO puede saltarse fases — debe hacer cada una antes de la siguiente.

  // Una ficha de huella está completa cuando se registran los 3 niveles:
  // Nivel 1 (tipo de dactilograma), Nivel 2 (recuento) y Nivel 3 (poros y bordes).
  const fichaCompleta=(f)=> !!f.n1diseno && !!f.n2recuento && !!f.n3poros && !!f.n3bordes;
  const fichaACompletaFicha=fichaCompleta(fichaA);
  const fichaBCompletaFicha=fichaCompleta(fichaB);

  // Fase A completa: ambas fichas confirmadas (a ciegas) + decisión de aptitud por huella + fase A confirmada.
  const aptitudTomada = !!aptitudA && !!aptitudB;
  const faseACompleta = confirmadoA; // confirmar A es el gate definitivo
  // Veto en origen: si alguna huella se marcó "no apta", el cotejo se cierra en A.
  const hayVeto = aptitudA==="no_apta" || aptitudB==="no_apta" || vetoEnOrigen;

  const faseCCompleta = confirmadoC && matched > 0; // pares marcados Y comparación confirmada
  // Aptitud baja / diseño forzado: estos factores salieron de la ficha A en esta
  // versión; la sugerencia queda inactiva hasta que se reincorpore (pendiente con C/E).
  const aptitudBaja = false;
  const faseECompleta = !!conclusion && justificacion.trim().length>=20;
  // V solo se accede desde "Completados" tras entregar — no es parte del editor
  const todasFasesACECompletas = faseACompleta && (hayVeto || (faseCCompleta && faseECompleta));

  // Edición del marcado (fase C): bloqueada si el cotejo está entregado/calificado
  // o si la fase C ya fue confirmada (se permite verla, no editarla — apdo. 9.2).
  const edicionCBloqueada = isReadOnly || confirmadoC;

  // Tabs ACE-V — definición visual de cada fase
  const fasesACEV = [
    {id:"A",label:"Análisis",completa:faseACompleta,disabled:false},
    {id:"C",label:"Comparación",completa:faseCCompleta,disabled:!faseACompleta||hayVeto},
    {id:"E",label:"Evaluación",completa:faseECompleta,disabled:!faseACompleta||hayVeto||!faseCCompleta},
  ];

  return(
    <div style={{background:C.winGray,height:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text,overflow:"hidden"}}>
      <div style={{...titleBarStyle,fontSize:13,padding:"4px 10px",borderBottom:`2px solid ${C.borderD}`}}>
        <button onClick={onBack} style={{...winBtn(),fontSize:10,padding:"1px 8px"}}>◀ Inicio</button>
        <FpLogo size={22} stroke="#fff"/>
        <span style={{fontWeight:"bold",fontSize:12,marginLeft:6}}>Cotejo: <span style={{fontWeight:"normal"}}>{cotejo?.name||"—"}</span></span>
        {cotejo?.noteCaso&&<span style={{marginLeft:10,fontSize:10,color:"#cce",fontFamily:FONT}}>ID: <b style={{color:"#fff"}}>{cotejo.noteCaso}</b></span>}
        {isReadOnly&&<span style={{marginLeft:8,background:"#cc6600",color:"#fff",padding:"1px 8px",fontSize:9,fontFamily:FONT,letterSpacing:1}}>🔒 SÓLO LECTURA — {cotejo?.status==="calificado"?"CALIFICADO":"ENTREGADO"}</span>}
        {esModeloDocente&&<span style={{marginLeft:8,background:finalizado?"#006400":"#aa6600",color:"#fff",padding:"1px 8px",fontSize:9,fontFamily:FONT,letterSpacing:1}}>{finalizado?"✓ TERMINADO":"✏ EN PROGRESO"}</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          {savedMsg&&<span style={{fontSize:10,color:"#adf"}}>{savedMsg}</span>}
          {!isReadOnly&&<button onClick={handleSave} title="Guardar (Ctrl+S)" style={winBtn()}>💾 Guardar</button>}
          <button onClick={()=>setShowHelp(true)} title="Ayuda y atajos de teclado" style={winBtn()}>❓ Ayuda</button>
          <button onClick={onLogout} title="Cerrar sesión" style={{...winBtn(),color:C.red}}>🚪</button>
        </div>
      </div>

      {isReadOnly&&cotejo?.status==="calificado"&&cotejo?.grade!=null&&(
        <div style={{background:"#e8f0e8",borderBottom:`2px solid #006400`,padding:"6px 16px",display:"flex",alignItems:"center",gap:16,fontFamily:FONT}}>
          <span style={{fontSize:11,color:"#006400",fontWeight:"bold"}}>📝 CALIFICACIÓN DEL DOCENTE:</span>
          <span style={{fontSize:18,fontWeight:"bold",color:"#006400",fontFamily:FONT}}>{cotejo.grade}/100</span>
          {cotejo.feedback&&<span style={{fontSize:11,color:C.textGray,fontStyle:"italic"}}>"{cotejo.feedback}"</span>}
          <span style={{marginLeft:"auto",fontSize:9,color:C.textLight}}>Revisado: {cotejo.reviewedAt||"?"}</span>
        </div>
      )}
      {/* ── BARRA SIMPLE: MODO PRÁCTICA LIBRE ── */}
      {!isReadOnly&&modoLibre&&<div style={{background:"#eef6ee",borderBottom:`2px solid #2e7d32`,padding:"5px 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:11,fontWeight:"bold",color:"#2e7d32",letterSpacing:0.5}}>🎯 PRÁCTICA LIBRE</span>
        <span style={{fontSize:10,color:C.textGray}}>Marque las minucias que encuentre en ambas huellas. Sin fases obligatorias — practique a su ritmo.</span>
        <span style={{marginLeft:"auto",fontSize:10,color:C.blue}}>Pares marcados: <b>{matched}</b></span>
      </div>}
      {/* ── BARRA DE FASES ACE-V (solo en modo estricto) ── */}
      {!isReadOnly&&!modoLibre&&<div style={{background:C.winGray2,borderBottom:`2px solid ${C.borderD}`,padding:"4px 8px",display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:10,fontWeight:"bold",color:C.text,letterSpacing:0.5,marginRight:4}}>MÉTODO ACE-V:</span>
        {fasesACEV.map((f,i)=>{
          const activa=faseACEV===f.id;
          const colorFase=f.completa?"#006400":(activa?C.blue:C.textLight);
          return(
            <button
              key={f.id}
              onClick={()=>!f.disabled&&setFaseACEV(f.id)}
              disabled={f.disabled}
              title={f.disabled?`Complete primero la(s) fase(s) anterior(es)`:`Ir a fase ${f.id} — ${f.label}`}
              style={{
                ...raised,
                background:activa?C.winGray3:(f.completa?"#e8f0e8":C.winGray),
                border:activa?`2px solid ${C.blue}`:undefined,
                padding:"4px 14px",
                cursor:f.disabled?"not-allowed":"pointer",
                opacity:f.disabled?0.45:1,
                display:"flex",
                alignItems:"center",
                gap:6,
                fontFamily:FONT,
                fontSize:11,
                fontWeight:activa?"bold":"normal",
                color:colorFase
              }}>
              <span style={{fontSize:13,fontWeight:"bold",color:colorFase}}>{f.id}</span>
              <span>—</span>
              <span>{f.label}</span>
              <span style={{marginLeft:4,fontSize:11}}>
                {f.completa?"✓":(f.disabled?"🔒":"●")}
              </span>
            </button>
          );
        })}
        {/* V — Verificación: solo informativo en el editor, se accede tras entregar */}
        <div title="La fase V se realiza desde 'Cotejos Completados' tras entregar" style={{...sunken,background:"#fff8f0",padding:"4px 14px",display:"flex",alignItems:"center",gap:6,fontFamily:FONT,fontSize:11,color:"#aa6600",opacity:0.7,marginLeft:4}}>
          <span style={{fontSize:13,fontWeight:"bold"}}>V</span>
          <span>—</span>
          <span>Verificación</span>
          <span style={{marginLeft:4}}>⚖</span>
        </div>
        <span style={{marginLeft:"auto",fontSize:9,color:hayVeto?"#c62828":C.textGray,fontStyle:"italic",fontWeight:hayVeto?"bold":"normal"}}>
          {hayVeto?"🚫 Veto en origen — cotejo cerrado en A (inconcluso)":(todasFasesACECompletas?"✓ Listo para entregar":"⚠ Complete A → C → E antes de entregar")}
        </span>
      </div>}
      <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>
        <div style={{position:"relative",flexShrink:0,display:"flex",width:sidebarCollapsed?12:60,transition:"width 0.15s"}}>
          {!sidebarCollapsed && <div style={{width:60,background:C.winGray,borderRight:`2px solid ${C.border}`,display:"flex",flexDirection:"column",alignItems:"center",padding:"6px 0",gap:2,opacity:edicionCBloqueada?0.5:1,pointerEvents:edicionCBloqueada?"none":"auto"}}>
          {SbBtn("select","⊹","SELEC.")}
          {SbBtn("circle","○","CÍRCULO")}
          {SbBtn("quality","✏","CALIDAD")}
          {SbBtn("crestas","⌒","CRESTAS")}
          {SbBtn("pan","✥","PAN")}
          <div style={{width:40,height:1,background:C.border,margin:"4px 0"}}/>
          <button onClick={()=>setShowColor(s=>!s)} style={{...raised,background:showColor?C.winGray3:C.winGray,width:50,height:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
            <div style={{width:12,height:12,border:"1px solid #000",background:color,flexShrink:0}}/>
            <span style={{fontSize:8,fontFamily:FONT}}>COLOR</span>
          </button>
          {showColor&&<div style={{...sunken,background:C.white,padding:4,display:"flex",flexDirection:"column",gap:3,alignItems:"center"}}>
            <div style={{minHeight:30,width:54,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {hoveredColor?<div style={{fontFamily:FONT,fontSize:8,fontWeight:"bold",color:C.black,background:"#ffff88",border:`1px solid #808000`,padding:"2px 4px",textAlign:"center",lineHeight:1.4}}><div style={{width:12,height:12,background:hoveredColor,border:"1px solid #000",margin:"0 auto 2px"}}/>{COLOR_NAMES[hoveredColor]}</div>:<span style={{fontSize:8,color:C.textLight,fontFamily:FONT}}>color</span>}
            </div>
            {COLORS.map(c=>(<button key={c} onClick={()=>setColor(c)} onMouseEnter={()=>setHoveredColor(c)} onMouseLeave={()=>setHoveredColor(null)} style={{width:18,height:18,background:c,border:color===c?"2px solid #000":"1px solid #808080",cursor:"pointer",transition:"transform 0.1s",transform:hoveredColor===c?"scale(1.4)":"scale(1)",outline:hoveredColor===c?`2px solid ${C.blue}`:""}}/>))}
          </div>}
          <div style={{width:40,height:1,background:C.border,margin:"4px 0"}}/>
          <button onClick={()=>setShowLayers(s=>!s)} title="Mostrar/ocultar capas (imágenes, marcas, etc.)" style={{...raised,background:showLayers?C.winGray3:C.winGray,width:50,height:44,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,padding:0}}>
            <span style={{fontSize:16,color:showLayers?C.blue:C.textGray,lineHeight:1}}>👁</span>
            <span style={{fontSize:7,fontFamily:FONT,color:showLayers?C.blue:C.textGray,letterSpacing:0.5}}>CAPAS</span>
          </button>
          <div style={{width:40,height:1,background:C.border,margin:"4px 0"}}/>
          <button onClick={undo} title="Deshacer (Ctrl+Z)" style={{...winBtn(),width:50,height:26,padding:"1px 0",textAlign:"center"}}>↩</button>
          <button onClick={redo} title="Rehacer (Ctrl+Y)" style={{...winBtn(),width:50,height:26,padding:"1px 0",textAlign:"center"}}>↪</button>
        </div>}
        {/* Flecha colapsar/expandir estilo VS Code */}
        <button
          onClick={()=>setSidebarCollapsed(c=>!c)}
          title={sidebarCollapsed?"Mostrar herramientas":"Ocultar herramientas"}
          style={{
            position:"absolute",
            top:"50%",
            right:sidebarCollapsed?-2:-10,
            transform:"translateY(-50%)",
            width:20,
            height:48,
            ...raised,
            background:C.winGray2,
            cursor:"pointer",
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            fontSize:12,
            color:C.text,
            zIndex:10,
            padding:0,
            fontFamily:FONT
          }}>{sidebarCollapsed?"▶":"◀"}</button>
        </div>

        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
          {/* ── FASE A: Análisis A CIEGAS (solo cuando faseACEV==="A" y no read-only) ── */}
          {!isReadOnly&&faseACEV==="A"&&(()=>{
            // Determina qué huella se analiza en cada sub-paso (a ciegas).
            // A1 = dubitada (imgA, fichaA, analisisA), A2 = indubitada (imgB, fichaB, analisisB).
            const esA1=subPasoA==="A1", esA2=subPasoA==="A2", esA3=subPasoA==="A3";
            const huellaSrc = esA1 ? imgAS : imgBS;
            const huellaNom = esA1 ? "DUBITADA (A)" : "INDUBITADA (B)";
            const ficha = esA1 ? fichaA : fichaB;
            const setFicha = esA1 ? setFichaA : setFichaB;
            const fichaOk = esA1 ? fichaACompletaFicha : fichaBCompletaFicha;
            const subConfirmado = esA1 ? confirmadoA1 : confirmadoA2;
            const lock = subConfirmado; // ficha confirmada → solo lectura
            const upd=(k,v)=>{ if(lock)return; setFicha(f=>({...f,[k]:v})); };
            // Selector visual de opciones (radios estilo Win95)
            const Opt=({campo,valor,etq})=>(
              <button type="button" disabled={lock} onClick={()=>upd(campo,valor)} style={{
                ...raised, background: ficha[campo]===valor?C.winGray3:C.winGray,
                border: ficha[campo]===valor?`2px solid ${C.blue}`:undefined,
                fontFamily:FONT, fontSize:10, padding:"3px 8px", cursor:lock?"default":"pointer",
                fontWeight: ficha[campo]===valor?"bold":"normal", color: ficha[campo]===valor?C.blue:C.text,
                opacity:lock&&ficha[campo]!==valor?0.5:1
              }}>{etq}</button>
            );
            return(
            <div style={{flex:1,overflow:"auto",padding:16,background:C.winGray}}>
              <div style={{maxWidth:1000,margin:"0 auto"}}>
                <div style={{...raised,background:"linear-gradient(90deg,#e8f0ff 0%,#fff 100%)",padding:"12px 18px",marginBottom:14,display:"flex",alignItems:"center",gap:14}}>
                  <div style={{...sunken,background:"#fff",color:C.blue,width:50,height:50,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:"bold",flexShrink:0}}>A</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:"bold",color:C.blue,marginBottom:2}}>FASE A — ANÁLISIS INDIVIDUAL (A CIEGAS)</div>
                    <div style={{fontSize:11,color:C.textGray,lineHeight:1.5}}>Se analiza <b>una huella a la vez</b>; la otra permanece <b>oculta</b>. Esto impide trasladar información de una huella a la otra (apdo. 8.4.1). No hay herramienta de comparación en esta fase.</div>
                  </div>
                </div>

                {/* Progreso del sub-flujo A.1 → A.2 → A.3 */}
                <div style={{display:"flex",gap:6,marginBottom:14,alignItems:"center"}}>
                  {[
                    {id:"A1",l:"A.1 · Dubitada",done:confirmadoA1},
                    {id:"A2",l:"A.2 · Indubitada",done:confirmadoA2,lock:!confirmadoA1},
                    {id:"A3",l:"A.3 · Aptitud",done:confirmadoA,lock:!confirmadoA1||!confirmadoA2},
                  ].map((p,i)=>(
                    <div key={p.id} style={{display:"flex",alignItems:"center",gap:6}}>
                      {i>0&&<span style={{color:C.textLight}}>→</span>}
                      <button onClick={()=>!p.lock&&setSubPasoA(p.id)} disabled={p.lock} title={p.lock?"Confirme el paso anterior":"Ir a "+p.l} style={{
                        ...raised, background: subPasoA===p.id?C.winGray3:(p.done?"#e8f0e8":C.winGray),
                        border: subPasoA===p.id?`2px solid ${C.blue}`:undefined,
                        padding:"4px 12px", fontFamily:FONT, fontSize:10, cursor:p.lock?"not-allowed":"pointer",
                        opacity:p.lock?0.45:1, fontWeight:subPasoA===p.id?"bold":"normal",
                        color: p.done?"#006400":(subPasoA===p.id?C.blue:C.textGray)
                      }}>{p.done?"✓ ":(p.lock?"🔒 ":"")}{p.l}</button>
                    </div>
                  ))}
                </div>

                {/* ── A.1 / A.2 — ficha de la huella visible (la otra está oculta) ── */}
                {(esA1||esA2)&&(<>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:14,alignItems:"start"}}>
                    {/* Huella visible */}
                    <div style={{...sunken,background:"#000",position:"relative"}}>
                      <div style={{position:"absolute",top:0,left:0,right:0,background:"rgba(0,0,40,0.85)",color:"#fff",fontSize:10,fontWeight:"bold",padding:"3px 8px",letterSpacing:1,zIndex:2,fontFamily:FONT}}>👁 HUELLA {huellaNom}</div>
                      {huellaSrc
                        ? <img src={huellaSrc} alt="" style={{display:"block",width:"100%",height:"auto",marginTop:0}}/>
                        : <div style={{padding:40,color:C.textLight,textAlign:"center",fontSize:11}}>Sin imagen</div>}
                      <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(60,0,0,0.8)",color:"#ffd0d0",fontSize:9,padding:"3px 8px",fontFamily:FONT,letterSpacing:0.5}}>🚫 La otra huella permanece oculta en esta fase</div>
                    </div>

                    {/* Ficha de análisis (modelo integrador embebido) */}
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      {lock&&<div style={{...sunken,background:"#e8f0e8",padding:"6px 10px",fontSize:10,color:"#006400",fontWeight:"bold"}}>🔒 Análisis confirmado — queda como constancia escrita (solo lectura).</div>}

                      {/* Nivel 1 — Tipo de dactilograma (barra desplegable, una por huella) */}
                      <div style={{...raised,background:C.winGray,padding:"7px 9px"}}>
                        <div style={{fontSize:11,fontWeight:"bold",color:C.blue,marginBottom:5}}>NIVEL 1</div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:10,color:C.text,flexShrink:0}}>Tipo de dactilograma:</span>
                          <select value={ficha.n1diseno} disabled={lock} onChange={e=>upd("n1diseno",e.target.value)} style={{flex:1,...sunken,fontFamily:FONT,fontSize:10,padding:"3px 6px",color:C.text,outline:"none",background:lock?"#f4f4f4":C.white,cursor:lock?"default":"pointer"}}>
                            <option value="">— Seleccione un tipo —</option>
                            <option value="Arco">A · Arco</option>
                            <option value="Arco en tienda">T · Arco en tienda</option>
                            <option value="Presilla radial">R · Presilla radial</option>
                            <option value="Presilla cubital">U · Presilla cubital</option>
                            <option value="Verticilo">W · Verticilo</option>
                            <option value="Doble presilla">D · Doble presilla</option>
                            <option value="Central de bolsillo">C · Central de bolsillo</option>
                            <option value="Accidental">X · Accidental</option>
                            <option value="Desconocido">? · Desconocido</option>
                          </select>
                        </div>
                      </div>

                      {/* Nivel 2 */}
                      <div style={{...raised,background:C.winGray,padding:"7px 9px"}}>
                        <div style={{fontSize:11,fontWeight:"bold",color:C.blue,marginBottom:5}}>NIVEL 2 — Puntos característicos</div>
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:10,color:C.text}}>Recuento apreciable:</span>
                          {[["pocos","Pocos (<4)"],["medios","Medios (5–9)"],["muchos","Muchos (>10)"]].map(([v,l])=><Opt key={v} campo="n2recuento" valor={v} etq={l}/>)}
                        </div>
                      </div>

                      {/* Nivel 3 */}
                      <div style={{...raised,background:C.winGray,padding:"7px 9px"}}>
                        <div style={{fontSize:11,fontWeight:"bold",color:C.blue,marginBottom:5}}>NIVEL 3 — Poros y bordes de cresta</div>
                        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:5,flexWrap:"wrap"}}>
                          <span style={{fontSize:10,width:120}}>¿Se aprecian poros?</span>
                          {[["no","No"],["si","Sí"],["dudoso","Dudoso"]].map(([v,l])=><Opt key={v} campo="n3poros" valor={v} etq={l}/>)}
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:10,width:120}}>¿Bordes/aristas?</span>
                          {[["no","No"],["si","Sí"],["dudoso","Dudoso"]].map(([v,l])=><Opt key={v} campo="n3bordes" valor={v} etq={l}/>)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Botón confirmar / avanzar */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14,gap:8}}>
                    <span style={{fontSize:10,color:C.textGray,fontStyle:"italic"}}>
                      {esA1?"Paso A.1 — Tras confirmar, se revelará la huella indubitada.":"Paso A.2 — Tras confirmar, decidirá la aptitud de cada huella."}
                    </span>
                    {!subConfirmado
                      ? <button onClick={()=>{
                          if(esA1){setConfirmadoA1(true);setSubPasoA("A2");}
                          else{setConfirmadoA2(true);setSubPasoA("A3");}
                        }} disabled={!fichaOk} title={!fichaOk?"Complete la ficha (3 niveles)":"Confirmar análisis de esta huella"} style={{...winBtn(),fontWeight:"bold",fontSize:12,padding:"6px 18px",color:!fichaOk?C.textLight:C.blue,cursor:!fichaOk?"not-allowed":"pointer",opacity:!fichaOk?0.5:1}}>
                          ✓ Confirmar análisis {esA1?"de la dubitada":"de la indubitada"} ▶
                        </button>
                      : <button onClick={()=>setSubPasoA(esA1?"A2":"A3")} style={{...winBtn(),fontWeight:"bold",fontSize:12,padding:"6px 18px",color:C.blue}}>
                          Continuar ▶
                        </button>}
                  </div>
                </>)}

                {/* ── A.3 — Decisión de aptitud (veto en origen) ── */}
                {esA3&&(<>
                  <div style={{...sunken,background:"#fffff0",padding:"10px 14px",marginBottom:14,fontSize:11,color:"#7a6000",lineHeight:1.6}}>
                    Decida si <b>cada huella</b> tiene datos suficientes para continuar. Detenerse aquí es una conclusión válida del método (apdos. 8.12.2, 8.12.6), <b>no un fracaso</b>. Nunca está obligado a continuar.
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                    {[
                      {nom:"DUBITADA (A)",val:aptitudA,set:setAptitudA,f:fichaA},
                      {nom:"INDUBITADA (B)",val:aptitudB,set:setAptitudB,f:fichaB},
                    ].map(h=>(
                      <div key={h.nom} style={{...raised,background:C.winGray,padding:12}}>
                        <div style={{fontSize:12,fontWeight:"bold",color:C.blue,marginBottom:8}}>Huella {h.nom}</div>
                        <div style={{fontSize:9,color:C.textGray,marginBottom:10,lineHeight:1.5}}>
                          Diseño: <b>{h.f.n1diseno||"—"}</b> · Recuento: <b>{h.f.n2recuento||"—"}</b>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          <button onClick={()=>!confirmadoA&&h.set("apta")} disabled={confirmadoA} style={{...raised,background:h.val==="apta"?"#e8f0e8":C.winGray,border:h.val==="apta"?"2px solid #006400":undefined,padding:"8px",fontFamily:FONT,fontSize:11,cursor:confirmadoA?"default":"pointer",textAlign:"left",color:h.val==="apta"?"#006400":C.text,fontWeight:h.val==="apta"?"bold":"normal",opacity:confirmadoA&&h.val!=="apta"?0.5:1}}>✓ Apta para continuar</button>
                          <button onClick={()=>!confirmadoA&&h.set("no_apta")} disabled={confirmadoA} style={{...raised,background:h.val==="no_apta"?"#ffe8e8":C.winGray,border:h.val==="no_apta"?"2px solid #c62828":undefined,padding:"8px",fontFamily:FONT,fontSize:11,cursor:confirmadoA?"default":"pointer",textAlign:"left",color:h.val==="no_apta"?"#c62828":C.text,fontWeight:h.val==="no_apta"?"bold":"normal",opacity:confirmadoA&&h.val!=="no_apta"?0.5:1}}>✗ Sin valor para identificación (veto)</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {(aptitudA==="no_apta"||aptitudB==="no_apta")&&(
                    <div style={{...sunken,background:"#ffe8e8",padding:"10px 14px",marginTop:14,fontSize:11,color:"#c62828",lineHeight:1.6}}>
                      🚫 <b>Veto en origen:</b> al menos una huella no tiene valor para identificación. Al confirmar la fase A, el cotejo se cerrará con conclusión <b>"huella sin valor para identificación"</b> y no se pasará a comparación. Es un resultado legítimo del método.
                    </div>
                  )}

                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,gap:8}}>
                    <button onClick={()=>setSubPasoA("A2")} style={{...winBtn(),fontSize:11,padding:"6px 14px"}}>◀ Volver a A.2</button>
                    {confirmadoA
                      ? (hayVeto
                          ? <span style={{fontSize:11,color:"#c62828",fontWeight:"bold"}}>🚫 Cotejo cerrado por veto en origen (inconcluso).</span>
                          : <button onClick={()=>setFaseACEV("C")} style={{...winBtn(),fontWeight:"bold",fontSize:12,padding:"6px 18px",color:C.blue}}>Ir a C — Comparación ▶</button>)
                      : <button onClick={()=>{
                          const veto = aptitudA==="no_apta"||aptitudB==="no_apta";
                          setVetoEnOrigen(veto);
                          setConfirmadoA(true);
                          if(veto){ setConclusion("inconcluso"); setFaseACEV("A"); }
                          else { setFaseACEV("C"); }
                          handleSave();
                        }} disabled={!aptitudTomada} title={!aptitudTomada?"Decida la aptitud de ambas huellas":"Confirmar fase A"} style={{...winBtn(),fontWeight:"bold",fontSize:12,padding:"6px 18px",color:!aptitudTomada?C.textLight:( (aptitudA==="no_apta"||aptitudB==="no_apta")?"#c62828":C.blue),cursor:!aptitudTomada?"not-allowed":"pointer",opacity:!aptitudTomada?0.5:1}}>
                          {(aptitudA==="no_apta"||aptitudB==="no_apta")?"✓ Cerrar cotejo (veto en origen)":"✓ Confirmar A y continuar a C ▶"}
                        </button>}
                  </div>
                </>)}
              </div>
            </div>
            );
          })()}


          {/* ── FASE E: Evaluación (solo cuando faseACEV==="E" y no read-only) ── */}
          {!isReadOnly&&faseACEV==="E"&&(
            <div style={{flex:1,overflow:"auto",padding:16,background:C.winGray}}>
              <div style={{maxWidth:900,margin:"0 auto"}}>
                <div style={{...raised,background:"linear-gradient(90deg,#ffe8e8 0%,#fff 100%)",padding:"12px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
                  <div style={{...sunken,background:"#fff",color:"#c62828",width:50,height:50,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:"bold",flexShrink:0}}>E</div>
                  <div>
                    <div style={{fontSize:14,fontWeight:"bold",color:"#c62828",marginBottom:2}}>FASE E — EVALUACIÓN</div>
                    <div style={{fontSize:11,color:C.textGray,lineHeight:1.5}}>Con base en su análisis y comparación, emita una <b>conclusión técnica</b> y justifíquela. Esta es la decisión pericial del cotejo.</div>
                  </div>
                </div>
                {/* Conclusión: 3 opciones */}
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:"bold",color:!conclusion?C.red:C.text,marginBottom:8}}>
                    CONCLUSIÓN TÉCNICA: {!conclusion&&<span style={{color:C.red}}>*</span>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                    {[
                      {v:"identificacion",l:"IDENTIFICACIÓN",sub:"Misma fuente",icon:"✓",color:"#006400",bg:"#e8f0e8"},
                      {v:"exclusion",l:"EXCLUSIÓN",sub:"Distinta fuente",icon:"✗",color:"#c62828",bg:"#ffe8e8"},
                      {v:"inconcluso",l:"INCONCLUSO",sub:"Información insuficiente",icon:"?",color:"#7a6000",bg:"#fffff0"},
                    ].map(opt=>{
                      const sel=conclusion===opt.v;
                      return(
                        <button key={opt.v} onClick={()=>setConclusion(opt.v)} title={opt.l} style={{
                          ...raised,
                          background:sel?opt.bg:C.winGray,
                          border:sel?`3px solid ${opt.color}`:undefined,
                          padding:"14px 10px",
                          cursor:"pointer",
                          fontFamily:FONT,
                          display:"flex",
                          flexDirection:"column",
                          alignItems:"center",
                          gap:4,
                          position:"relative"
                        }}>
                          <span style={{fontSize:30,fontWeight:"bold",color:opt.color}}>{opt.icon}</span>
                          <span style={{fontSize:12,fontWeight:"bold",color:opt.color}}>{opt.l}</span>
                          <span style={{fontSize:9,color:C.textGray,fontStyle:"italic"}}>{opt.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Justificación */}
                {(()=>{
                  const vacio=justificacion.trim().length<20;
                  return(
                    <div style={{display:"flex",flexDirection:"column",gap:4}}>
                      <label style={{fontSize:11,fontWeight:"bold",color:vacio?C.red:"#006400",display:"flex",justifyContent:"space-between"}}>
                        <span>JUSTIFICACIÓN TÉCNICA {vacio&&<span style={{color:C.red}}>*</span>}</span>
                        <span style={{fontSize:9,color:C.textGray,fontWeight:"normal"}}>{justificacion.trim().length} caracteres {vacio&&"(mín. 20)"}</span>
                      </label>
                      <textarea value={justificacion} onChange={e=>setJustificacion(e.target.value)} placeholder="Explique por qué llegó a esa conclusión: cantidad de puntos coincidentes, calidad de las muestras, discrepancias explicables, criterios aplicados..." style={{minHeight:160,...sunken,fontFamily:FONT,fontSize:11,padding:10,color:C.text,resize:"vertical",lineHeight:1.6,outline:"none",background:vacio?"#fff8f0":C.white,borderLeft:vacio?`3px solid ${C.red}`:undefined}}/>
                    </div>
                  );
                })()}
                <div style={{display:"flex",justifyContent:"space-between",marginTop:14,gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <button onClick={()=>setFaseACEV("C")} style={{...winBtn(),fontSize:12,padding:"6px 18px"}}>◀ Volver a C</button>
                  <span style={{fontSize:10,color:faseECompleta?"#006400":C.textGray}}>
                    {faseECompleta
                      ? (esModeloDocente
                          ? (finalizado?"✓ Cotejo TERMINADO — ya puede publicarlo desde el panel":"✓ Fase E completa — Finalice el cotejo para poder publicarlo")
                          : (esCotejoEstudiante?"✓ Fase E completa — Ya puede entregar su cotejo":"✓ Fase E completa"))
                      : "⚠ Complete conclusión y justificación"}
                  </span>
                  {esModeloDocente&&!finalizado&&(
                    <button onClick={finalizarModelo} disabled={matched===0||!faseECompleta}
                      title={matched===0?"Marque al menos 1 par de puntos en ambas muestras":!faseECompleta?"Complete conclusión y justificación":"Marcar como terminado (requisito para publicar)"}
                      style={{...winBtn(),fontSize:13,fontWeight:"bold",padding:"8px 26px",color:(matched===0||!faseECompleta)?C.textLight:"#006400",opacity:(matched===0||!faseECompleta)?0.55:1,cursor:(matched===0||!faseECompleta)?"not-allowed":"pointer"}}>
                      ✓ Finalizar cotejo
                    </button>
                  )}
                  {esModeloDocente&&finalizado&&(
                    <button onClick={reabrirModelo} title="Volver a edición (si está publicado, se despublicará)"
                      style={{...winBtn(),fontSize:12,fontWeight:"bold",padding:"8px 20px",color:"#aa6600"}}>
                      ✏ Reabrir para editar
                    </button>
                  )}
                  {esCotejoEstudiante&&!isReadOnly&&(
                    <button onClick={entregarDesdeEditor} disabled={!faseECompleta}
                      title={!faseECompleta?"Complete conclusión y justificación":"Entregar el cotejo al docente (no podrá modificarlo después)"}
                      style={{...winBtn(),fontSize:13,fontWeight:"bold",padding:"8px 26px",color:!faseECompleta?C.textLight:C.blue,opacity:!faseECompleta?0.55:1,cursor:!faseECompleta?"not-allowed":"pointer"}}>
                      📤 Entregar cotejo
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* ── FASE C: editor de comparación (vista actual cuando faseACEV==="C" o read-only) ── */}
          {(isReadOnly||faseACEV==="C")&&<>
          {/* Status bar */}
          <div style={{background:C.winGray,borderBottom:`2px solid ${C.border}`,padding:"3px 10px",display:"flex",alignItems:"center",gap:12,flexShrink:0,flexWrap:"wrap"}}>
            <div style={{...raised,background:C.white,padding:"2px 10px",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,color:C.textLight}}>PUNTO:</span>
              <span style={{fontWeight:"bold",fontSize:18,color:pendSide===null?C.blue:C.yellow,fontFamily:FONT}}>{curLabel}</span>
            </div>
            <div style={{...sunken,background:C.white,padding:"2px 8px",flex:1}}>
              <span style={{fontSize:10,fontWeight:"bold",color:pendSide===null?C.blue:C.yellow}}>{pendSide===null?`→ Dibujar punto ${curLabel} en DUBITADA`:`✓ Dubitada marcada → Dibujar punto ${curLabel} en INDUBITADA`}</span>
            </div>
            <div style={{display:"flex",gap:2,flexWrap:"wrap",maxWidth:200}}>
              {allLabels.map(n=>{const inA=leftShapes.some(s=>s.label===n),inB=rightShapes.some(s=>s.label===n),both=inA&&inB;return(
                <div key={n} style={{width:18,height:18,...(both?{...raised,background:"#90c090"}:inA||inB?{...raised,background:"#c0c060"}:{...sunken,background:C.white}),display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:9,fontWeight:"bold",color:both?C.green:inA||inB?C.yellow:C.textLight}}>{n}</span>
                </div>
              );})}
            </div>
            <div style={{...raised,background:C.white,padding:"2px 10px",textAlign:"center",flexShrink:0}}>
              <div style={{fontSize:9,color:C.textLight}}>PARES</div>
              <div style={{fontWeight:"bold",fontSize:16,color:C.blue}}>{matched}</div>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:4,fontSize:10,cursor:"pointer"}}><input type="checkbox" checked={syncZoom} onChange={e=>setSyncZoom(e.target.checked)}/> Sync Zoom</label>
          </div>
          {hasMissing&&<div style={{background:"#ffffc0",borderBottom:`1px solid ${C.yellow}`,padding:"3px 10px",display:"flex",alignItems:"center",gap:8,flexShrink:0,flexWrap:"wrap"}}>
            <span style={{fontSize:10,fontWeight:"bold",color:C.orange}}>⚠ Faltantes:</span>
            {missingA.map(l=>(<button key={"A"+l} onClick={()=>fixLabel(l,"A")} style={{...winBtn(),fontSize:9,padding:"1px 6px",color:C.red}}>A-{l}</button>))}
            {missingB.map(l=>(<button key={"B"+l} onClick={()=>fixLabel(l,"B")} style={{...winBtn(),fontSize:9,padding:"1px 6px",color:C.blue}}>B-{l}</button>))}
          </div>}

          {!isReadOnly&&confirmadoC&&faseACEV==="C"&&(
            <div style={{background:"#e8f0e8",borderBottom:`1px solid #006400`,padding:"3px 10px",fontSize:10,color:"#006400",fontWeight:"bold"}}>🔒 Comparación confirmada — puede revisarla, pero ya no editarla. Continúe a la fase E.</div>
          )}
          <div style={{flex:1,display:"flex",overflow:"hidden",minHeight:0,gap:3,padding:4,background:C.winGray2,pointerEvents:edicionCBloqueada?"none":"auto",opacity:edicionCBloqueada?0.92:1}}>
            <ImagePanel ref={leftPanelRef} side="left" imgSrc={imgAS} shapes={leftShapes} setShapes={setLeftShapes} tool={tool} color={color} currentLabel={curLabel} onShapePlaced={onShapePlaced} zoom={lZoom} setZoom={setZoom} syncZoom={syncZoom} setHistory={setLHist} setRedoStack={setLRedo} imgFilter={fA} setImgFilter={setFA} onSyncWheel={handleSyncWheel} layers={layers}/>
            <ImagePanel ref={rightPanelRef} side="right" imgSrc={imgBS} shapes={rightShapes} setShapes={setRightShapes} tool={tool} color={color} currentLabel={curLabel} onShapePlaced={onShapePlaced} zoom={rZoom} setZoom={setZoom} syncZoom={syncZoom} setHistory={setRHist} setRedoStack={setRRedo} imgFilter={fB} setImgFilter={setFB} onSyncWheel={handleSyncWheel} layers={layers}/>
          </div>

          {/* Points */}
          <div style={{flexShrink:0,background:C.winGray,borderTop:`2px solid ${C.blue}`}}>
            <button onClick={()=>setShowPoints(p=>!p)} style={{width:"100%",...winBtn(),textAlign:"left",display:"flex",alignItems:"center",gap:10,padding:"4px 12px",borderTop:"none",borderLeft:"none",borderRight:"none"}}>
              <span style={{fontWeight:"bold",color:C.blue,fontSize:11}}>{showPoints?"▼":"▲"} PUNTOS CARACTERÍSTICOS</span>
              <span style={{color:C.textLight,fontSize:10}}>— {pointNames.filter(Boolean).length}/10 nombrados</span>
            </button>
            {showPoints&&<div style={{padding:"6px 12px 10px",display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,borderTop:`1px solid ${C.border}`}}>
              {pointNames.map((name,i)=>{const n=i+1,inA=leftShapes.some(s=>s.label===String(n)),inB=rightShapes.some(s=>s.label===String(n)),both=inA&&inB;return(<div key={i} style={{display:"flex",flexDirection:"column",gap:3}}>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{...raised,width:18,height:18,background:both?"#90c090":inA||inB?"#c0c060":C.white,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:9,fontWeight:"bold",color:both?C.green:inA||inB?C.yellow:C.blue}}>{n}</span></div>
                  <span style={{fontSize:9,color:inA?C.green:C.textLight}}>A</span>
                  <span style={{fontSize:9,color:inB?C.green:C.textLight}}>B</span>
                </div>
                <input value={name} onChange={e=>{const a=[...pointNames];a[i]=e.target.value;setPointNames(a);}} placeholder={`Punto ${n}…`} style={{...sunken,fontFamily:FONT,fontSize:10,padding:"2px 4px",color:C.text,outline:"none",width:"100%",boxSizing:"border-box",background:C.white}}/>
              </div>);})}
            </div>}
          </div>

          {/* ── Barra simple de práctica libre ── */}
          {!isReadOnly&&modoLibre&&(
            <div style={{flexShrink:0,background:"#eef6ee",borderTop:`2px solid #2e7d32`,padding:"8px 12px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <span style={{fontSize:10,color:C.textGray}}>💡 Use ○ Círculo para marcar minucias y ✏ Calidad o ⌒ Crestas para resaltar. Marque el mismo punto en A y en B para formar un par.</span>
              <span style={{marginLeft:"auto",fontSize:10,color:matched>0?"#2e7d32":C.textGray}}>{matched>0?`✓ ${matched} par(es) coincidente(s)`:"Aún no hay pares"}</span>
              <button onClick={handleSave} style={{...winBtn(),fontWeight:"bold",fontSize:11,padding:"5px 16px",color:"#2e7d32"}}>💾 Guardar práctica</button>
            </div>
          )}

          {/* ── Confirmación de la fase C (solo modo estricto) ── */}
          {!isReadOnly&&!modoLibre&&faseACEV==="C"&&(
            <div style={{flexShrink:0,background:C.winGray,borderTop:`2px solid ${C.blue}`,padding:"8px 12px"}}>
              {/* Confirmar comparación */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                <button onClick={()=>{setFaseACEV("A");}} style={{...winBtn(),fontSize:11,padding:"5px 14px"}}>◀ Volver a A (solo lectura)</button>
                <span style={{fontSize:10,color:matched>0?C.textGray:C.red,marginLeft:"auto",marginRight:8}}>
                  {matched>0?`${matched} par(es) coincidente(s)`:"⚠ Marque al menos un par en ambas muestras"}
                </span>
                <button onClick={()=>{ setConfirmadoC(true); setFaseACEV("E"); handleSave(); }} disabled={matched===0} title={matched===0?"Marque al menos un par":"Confirmar comparación y pasar a Evaluación"} style={{...winBtn(),fontWeight:"bold",fontSize:12,padding:"6px 18px",color:matched===0?C.textLight:C.blue,cursor:matched===0?"not-allowed":"pointer",opacity:matched===0?0.5:1}}>
                  ✓ Confirmar C y continuar a E ▶
                </button>
              </div>
            </div>
          )}

          {/* Referencia de puntos característicos — eliminado */}
          </>}
        </div>

        {/* Layers panel */}
        {showLayers&&<div style={{width:220,background:C.winGray,borderLeft:`2px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{...titleBarStyle,fontSize:11}}>👁 CAPAS<button onClick={()=>setShowLayers(false)} style={{...winBtn(),marginLeft:"auto",padding:"0 6px",minWidth:16,fontSize:11}}>✕</button></div>
          <div style={{padding:10,display:"flex",flexDirection:"column",gap:6}}>
            <div style={{...sunken,background:"#fffff0",padding:"6px 8px",fontSize:9,color:"#7a6000",lineHeight:1.5,marginBottom:4}}>
              Active/desactive capas sobre las muestras A y B.
            </div>
            {[
              {k:"images",l:"🖼️ Imágenes",d:"Huellas dactilares"},
              {k:"minucias",l:"⭕ Minucias",d:"Círculos numerados"},
              {k:"quality",l:"✏ Calidad",d:"Trazos a mano alzada"},
              {k:"crestas",l:"⌒ Crestas",d:"Líneas de crestas"},
              {k:"labels",l:"🔢 Etiquetas",d:"Números al lado"},
            ].map(lyr=>(
              <button key={lyr.k} onClick={()=>setLayers(p=>({...p,[lyr.k]:!p[lyr.k]}))} style={{...winBtn(layers[lyr.k]),padding:"6px 8px",textAlign:"left",display:"flex",flexDirection:"column",gap:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,fontWeight:"bold"}}>{lyr.l}</span>
                  <span style={{fontSize:9,color:layers[lyr.k]?C.green:C.textLight,fontFamily:FONT}}>{layers[lyr.k]?"[ON]":"[OFF]"}</span>
                </div>
                <span style={{fontSize:8,color:C.textGray,fontFamily:FONT}}>{lyr.d}</span>
              </button>
            ))}
            <div style={{display:"flex",gap:4,marginTop:6}}>
              <button onClick={()=>setLayers({images:true,quality:true,minucias:true,crestas:true,labels:true})} style={{...winBtn(),flex:1,fontSize:9,padding:"3px 0"}}>👁 Todas</button>
              <button onClick={()=>setLayers({images:true,quality:false,minucias:false,crestas:false,labels:false})} style={{...winBtn(),flex:1,fontSize:9,padding:"3px 0"}}>🖼️ Solo img</button>
            </div>
          </div>
        </div>}

      </div>
      <div style={{background:C.winGray2,borderTop:`2px solid ${C.border}`,padding:"2px 12px",display:"flex",gap:20,alignItems:"center"}}>
        <span style={{fontSize:9,color:C.textLight}}>SIMUSID v1.0</span>
        <span style={{fontSize:9,color:C.textLight}}>{!isReadOnly?"Ctrl+Z · Ctrl+Y · Ctrl+S · Supr: borrar · ❓ Ayuda":"🔒 Modo lectura"}</span>
        <span style={{marginLeft:"auto",fontSize:9,color:C.textLight}}>ENTORNO ACADÉMICO DE PRÁCTICA</span>
        <LiveClock/>
      </div>
      {showHelp&&<HelpModal onClose={()=>setShowHelp(false)} context="editor"/>}
    </div>
  );
}

// ── DOCENTE PANEL ─────────────────────────────────────────────────
// Plantillas de feedback rápido para calificación
const FEEDBACK_TEMPLATES=[
  "Excelente identificación de minucias. Mantenga ese nivel.",
  "Buen trabajo, revise puntos en zona delta.",
  "Faltan puntos característicos por marcar.",
  "Verifique la clasificación: algunos puntos no corresponden al tipo señalado.",
  "Posiciones de los puntos imprecisas. Use mayor zoom al marcar.",
  "Bien las bifurcaciones; debe trabajar más las terminaciones (abruptas).",
  "Revise el cotejo modelo y compare la cantidad de pares.",
  "Práctica satisfactoria. Continúe con el siguiente cotejo.",
];

function DocentePanel({onLogout}){
  const [store,setStore]=useState(()=>loadStore());
  const [view,setView]=useState("dashboard"); // dashboard | galeria | cotejos | estudiantes | revisar | analitica | historial
  const [cotejoId,setCotejoId]=useState(null);
  const [newCotejo,setNewCotejo]=useState(null);
  const [pickingFor,setPickingFor]=useState(null);
  const [confirmDel,setConfirmDel]=useState(null);
  const [syncMsg,setSyncMsg]=useState("");
  const [credencialModal,setCredencialModal]=useState(null); // {nombre,apellido,cedula,tempPass,esReset}
  const [revisarFilter,setRevisarFilter]=useState("pendientes");
  const [calificando,setCalificando]=useState(null);
  const [newEstudiante,setNewEstudiante]=useState(null);
  const [estErr,setEstErr]=useState("");
  const [confirmDelEst,setConfirmDelEst]=useState(null);
  // ── Estados Fase 2 ───────────────────────────────────────────
  const [renaming,setRenaming]=useState(null); // {id, currentName}
  const [fichaEst,setFichaEst]=useState(null);           // estudiante para mostrar ficha individual
  const [searchEstudiantes,setSearchEstudiantes]=useState("");
  const [importingEst,setImportingEst]=useState(null);   // {text, preview, errors}
  const [confirmDevolver,setConfirmDevolver]=useState(null);
  const [confirmResetPass,setConfirmResetPass]=useState(null);
  const [publicandoConPlazo,setPublicandoConPlazo]=useState(null); // {cotejoId, deadline}
  const accent="#006400";

  useEffect(()=>{setStore(loadStore());},[]);

  const images=store.images||{},cotejos=store.cotejos||{};
  const persist=(u)=>{setStore(u);saveStore(u);};
  const refresh=()=>setStore(loadStore());
  const flash=(m)=>{setSyncMsg(m);setTimeout(()=>setSyncMsg(""),2500);};
  const uploadImage=async(e)=>{const f=e.target.files[0];if(!f)return;e.target.value="";flash("⏳ Subiendo imagen...");try{await api.uploadImage(f);setStore(loadStore());logEvent("imagen","subir",`Imagen "${f.name}" cargada por docente`,"docente");flash("✓ Imagen subida");}catch(err){flash("⚠ "+(err.message||"Error al subir imagen"));}};
  const createCotejo=()=>{if(!newCotejo?.name||!newCotejo?.imgA||!newCotejo?.imgB)return;const id=genId();const c={id,name:newCotejo.name,imgA:newCotejo.imgA,imgB:newCotejo.imgB,date:now(),leftShapes:[],rightShapes:[],maxLabel:1,currentLabel:1,noteCaso:"",notePerito:"",noteFecha:"",noteObs:"",pointNames:Array(10).fill(""),owner:"docente",status:"modelo",published:false};persist({...store,cotejos:{...(store.cotejos||{}),[id]:c}});setNewCotejo(null);setCotejoId(id);};
  const togglePublish=(id)=>{const c=store.cotejos[id];const u={...store,cotejos:{...store.cotejos,[id]:{...c,published:!c.published}}};persist(u);logEvent("cotejo",c.published?"despublicar":"publicar",`Cotejo "${c.name}" ${c.published?"ocultado":"publicado"}`,"docente");};
  const calificarCotejo=(id,grade,feedback)=>{const c=store.cotejos[id];const u={...store,cotejos:{...store.cotejos,[id]:{...c,status:"calificado",grade,feedback,reviewedAt:now()}}};persist(u);logEvent("cotejo","calificar",`Cotejo "${c.name}" calificado ${grade}/100`,"docente");setCalificando(null);setSyncMsg("✓ Calificación guardada");setTimeout(()=>setSyncMsg(""),2500);};
  const createEstudiante=async()=>{
    const {nombre,apellido,cedula,pass}=newEstudiante||{};
    if(!nombre?.trim()||!apellido?.trim()||!cedula?.trim()||!pass?.trim()){setEstErr("Complete todos los campos (incluida la contraseña).");return;}
    if(!/^\d{6,12}$/.test(cedula.trim())){setEstErr("La cédula debe tener entre 6 y 12 dígitos numéricos.");return;}
    if(pass.trim().length<6){setEstErr("La contraseña debe tener mínimo 6 caracteres.");return;}
    if(Object.values(store.estudiantes||{}).some(e=>e.cedula===cedula.trim())){setEstErr("Ya existe un estudiante con esa cédula.");return;}
    setEstErr("⏳ Creando cuenta...");
    try{
      await api.createStudent(nombre.trim(),apellido.trim(),cedula.trim(),pass.trim());
      setStore(loadStore());
      logEvent("usuario","registrar",`Estudiante ${nombre.trim()} ${apellido.trim()} (${cedula.trim()}) registrado`,"docente");
      setNewEstudiante(null);setEstErr("");
      setSyncMsg(`✓ Estudiante creado — usuario: ${cedula.trim()} · contraseña: la que usted definió (deberá cambiarla al ingresar)`);
      setTimeout(()=>setSyncMsg(""),10000);
    }catch(err){setEstErr("⚠ "+(err.message||"Error al crear estudiante"));}
  };
  const pairsOf=(c)=>[...new Set([...(c.leftShapes||[]),...(c.rightShapes||[])].map(s=>s.label).filter(Boolean))].filter(l=>(c.leftShapes||[]).some(s=>s.label===l)&&(c.rightShapes||[]).some(s=>s.label===l)).length;

  // ── Handlers Fase 2 ────────────────────────────────────────────
  // Devolver cotejo al estudiante (reentrega)
  const devolverCotejo=(id,motivo)=>{
    const c=cotejos[id];
    const u={...store,cotejos:{...store.cotejos,[id]:{...c,status:"en_progreso",submittedAt:null,grade:null,feedback:null,reviewedAt:null,returnedAt:now(),returnReason:motivo||""}}};
    persist(u);
    logEvent("cotejo","devolver",`Cotejo "${c.name}" devuelto al estudiante para reentrega`,"docente");
    setConfirmDevolver(null);flash("✓ Cotejo devuelto al estudiante");
  };
  // Duplicar cotejo modelo
  const duplicarCotejo=(orig)=>{
    const id=genId();
    const copia={...orig,id,name:`${orig.name} (copia)`,date:now(),published:false,status:"modelo",finalizado:false,finalizadoAt:null};
    persist({...store,cotejos:{...store.cotejos,[id]:copia}});
    logEvent("cotejo","duplicar",`Cotejo "${orig.name}" duplicado`,"docente");
    flash("✓ Cotejo duplicado");
  };
  // Renombrar cotejo modelo
  const renombrarCotejo=()=>{
    if(!renaming?.id||!renaming?.newName?.trim()) return;
    const c=store.cotejos[renaming.id];
    const oldName=c.name;
    const newName=renaming.newName.trim();
    const u={...store,cotejos:{...store.cotejos,[renaming.id]:{...c,name:newName}}};
    persist(u);
    logEvent("cotejo","renombrar",`Cotejo "${oldName}" renombrado a "${newName}"`,"docente");
    setRenaming(null);
    flash("✓ Cotejo renombrado");
  };
  // Publicar con plazo opcional (deadline ISO yyyy-mm-dd y modo strict/permisivo)
  const publicarConPlazo=(id,deadline,strict)=>{
    const c=store.cotejos[id];
    const u={...store,cotejos:{...store.cotejos,[id]:{...c,published:true,deadline:deadline||null,deadlineStrict:deadline?!!strict:false,publishedAt:now()}}};
    persist(u);
    logEvent("cotejo","publicar",`Cotejo "${c.name}" publicado${deadline?` con plazo hasta ${deadline} (${strict?"estricto":"permisivo"})`:""}`,"docente");
    setPublicandoConPlazo(null);flash("✓ Cotejo publicado");
  };
  // Resetear "contraseña" del estudiante (= cambiar cédula a una nueva)
  const resetearPassEstudiante=async(est,nuevaPass)=>{
    if(!nuevaPass||nuevaPass.trim().length<6){flash("⚠ La nueva contraseña debe tener mínimo 6 caracteres");return;}
    try{
      await api.resetStudentPassword(est.cedula,nuevaPass.trim());
      logEvent("usuario","reset_pass",`Contraseña de ${est.nombre} ${est.apellido} (${est.cedula}) cambiada`,"docente");
      setConfirmResetPass(null);
      flash(`✓ Contraseña de ${est.nombre} actualizada (deberá cambiarla al ingresar)`);
    }catch(err){flash("⚠ "+(err.message||"Error al cambiar contraseña"));}
  };
  // Importar lista de estudiantes desde texto CSV/líneas
  const procesarImportEst=(texto)=>{
    const lines=texto.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const ests=store.estudiantes||{};
    const existentes=new Set(Object.values(ests).map(e=>e.cedula));
    const preview=[], errors=[];
    const cedulasUsadas=new Set();
    lines.forEach((line,i)=>{
      const parts=line.split(/[,;\t]/).map(p=>p.trim());
      if(parts.length<3){errors.push(`Línea ${i+1}: formato inválido (esperado: nombre, apellido, cédula)`);return;}
      const [nombre,apellido,cedula]=parts;
      if(!nombre||!apellido||!cedula){errors.push(`Línea ${i+1}: campo vacío`);return;}
      if(!/^\d{6,12}$/.test(cedula)){errors.push(`Línea ${i+1}: cédula inválida (${cedula})`);return;}
      if(existentes.has(cedula)||cedulasUsadas.has(cedula)){errors.push(`Línea ${i+1}: cédula duplicada (${cedula})`);return;}
      cedulasUsadas.add(cedula);
      preview.push({nombre,apellido,cedula});
    });
    return {preview,errors};
  };
  const confirmarImportEst=async()=>{
    if(!importingEst?.preview?.length) return;
    flash("⏳ Creando cuentas...");
    const creds=[],fails=[];
    for(const p of importingEst.preview){
      try{
        const tp=await api.createStudent(p.nombre,p.apellido,p.cedula);
        creds.push(`${p.nombre} ${p.apellido}\tusuario: ${p.cedula}\tclave temporal: ${tp}`);
      }catch(err){fails.push(`${p.cedula}: ${err.message}`);}
    }
    setStore(loadStore());
    if(creds.length){
      const blob=new Blob(["SIMUSID — Credenciales de estudiantes (claves temporales)\n\n"+creds.join("\n")],{type:"text/plain"});
      const url=URL.createObjectURL(blob);const a=document.createElement("a");
      a.href=url;a.download="simusid_credenciales.txt";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
      logEvent("usuario","importar_csv",`${creds.length} estudiantes importados`,"docente");
    }
    setImportingEst(null);
    flash(`✓ ${creds.length} creados — credenciales descargadas en .txt${fails.length?` · ⚠ ${fails.length} fallaron`:""}`);
  };

  const allCotejosVals=Object.values(cotejos);
  const entregas=allCotejosVals.filter(c=>c.owner==="estudiante"&&(c.status==="entregado"||c.status==="calificado"));
  const pendientes=entregas.filter(c=>c.status==="entregado");
  const calificadas=entregas.filter(c=>c.status==="calificado");
  const visiblesRevisar=revisarFilter==="pendientes"?pendientes:revisarFilter==="calificados"?calificadas:entregas;
  const estudiantesUnicos=Object.keys(store.estudiantes||{}).length||new Set(allCotejosVals.filter(c=>c.owner==="estudiante").map(c=>c.studentId)).size;

  const imgList=Object.values(images).filter(img=>img.owner==="docente"&&!img.esGuia).sort((a,b)=>a.name.localeCompare(b.name));
  const cotejoList=Object.values(cotejos).filter(c=>c.owner==="docente"&&!c.esGuia).sort((a,b)=>(b.date||"").localeCompare(a.date||""));

  // Si está dentro de un cotejo, abrir el comparador
  if(cotejoId) return <CompareScreen cotejoId={cotejoId} onBack={()=>{setStore(loadStore());setCotejoId(null);}} onLogout={onLogout}/>;

  const renderHeader=(subtitle)=>(<>
    <div style={{...titleBarStyle,fontSize:14,padding:"4px 12px",borderBottom:`2px solid ${C.borderD}`}}>
      <FpLogo size={30} stroke="#fff"/><span style={{marginLeft:6}}>SIMUSID</span>
      <span style={{fontWeight:"normal",fontSize:10,letterSpacing:2}}>— PANEL DOCENTE{subtitle?` · ${subtitle}`:""}</span>
      <span style={{marginLeft:"auto",fontSize:10,color:"#cce"}}>v1.0</span>
    </div>
    <div style={{background:C.winGray,borderBottom:`1px solid ${C.border}`,padding:"2px 8px",display:"flex",gap:4,alignItems:"center"}}>
      <span style={{fontSize:10,color:accent,fontWeight:"bold"}}>ROL: DOCENTE</span>
      {view!=="dashboard"&&<button onClick={()=>setView("dashboard")} style={{...winBtn(),fontSize:10,padding:"1px 8px",marginLeft:10}}>◀ Volver al Panel</button>}
      {syncMsg&&<span style={{marginLeft:10,fontSize:10,color:C.blue}}>{syncMsg}</span>}
      <button onClick={onLogout} style={{...winBtn(),marginLeft:"auto",fontSize:10,padding:"1px 10px",color:C.red,fontWeight:"bold"}}>🚪 Cerrar sesión</button>
    </div>
  </>);

  const renderFooter=()=>(
    <div style={{background:C.winGray2,borderTop:`1px solid ${C.border}`,padding:"2px 12px",display:"flex"}}>
      <span style={{fontFamily:FONT,fontSize:10,color:C.textLight}}>SIMUSID v1.0 — Panel Docente</span>
      <span style={{marginLeft:"auto",fontFamily:FONT,fontSize:10,color:C.textLight}}>ENTORNO ACADÉMICO DE PRÁCTICA</span>
      <LiveClock/>
    </div>
  );

  const renderConfirmDel=()=>confirmDel?(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{...raised,background:C.winGray,padding:0,width:320}}>
      <div style={{...titleBarStyle,fontSize:11}}>⚠ Confirmar eliminación</div>
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:12,alignItems:"center"}}>
        <span style={{fontSize:11}}>Esta acción no se puede deshacer.</span>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setConfirmDel(null)} style={winBtn()}>Cancelar</button>
          <button onClick={()=>{const s={...store};if(s.images?.[confirmDel]){const i={...s.images};delete i[confirmDel];s.images=i;}else if(s.cotejos?.[confirmDel]){const c={...s.cotejos};delete c[confirmDel];s.cotejos=c;}persist(s);setConfirmDel(null);}} style={{...winBtn(),color:C.red}}>Sí, Eliminar</button>
        </div>
      </div>
    </div>
  </div>):null;

  const renderCalificarModal=()=>{
    if(!calificando) return null;
    const modelo=calificando.cotejo.parentId?cotejos[calificando.cotejo.parentId]:null;
    const sp=pairsOf(calificando.cotejo);
    const mp=modelo?pairsOf(modelo):0;
    const aplicarPlantilla=(txt)=>{
      setCalificando(c=>({...c,feedback:c.feedback?`${c.feedback} ${txt}`.trim():txt}));
    };
    return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{...raised,background:C.winGray,padding:0,width:520,maxWidth:"95vw",maxHeight:"92vh",display:"flex",flexDirection:"column"}}>
      <div style={{...titleBarStyle,fontSize:11}}>✏ Calificar Cotejo</div>
      <div style={{padding:14,display:"flex",flexDirection:"column",gap:10,overflowY:"auto"}}>
        <div style={{...sunken,background:C.white,padding:"6px 10px",fontSize:10,lineHeight:1.6}}>
          <div style={{fontWeight:"bold",color:accent,fontSize:11}}>{calificando.cotejo.name}</div>
          <div style={{color:C.textGray}}>Estudiante: <b>{calificando.cotejo.studentId}</b> · Entregado: {calificando.cotejo.submittedAt||"?"}</div>
          <div style={{color:C.textGray}}>Pares marcados: <b style={{color:accent}}>{sp}</b>{modelo?<> de <b>{mp}</b> en modelo</>:" (sin modelo de referencia)"}</div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <label style={{fontSize:11,fontWeight:"bold",color:accent,minWidth:100}}>Calificación:</label>
          <input type="number" min={0} max={100} value={calificando.grade} onChange={e=>setCalificando(c=>({...c,grade:Math.max(0,Math.min(100,Number(e.target.value)||0))}))} style={{...sunken,fontFamily:FONT,fontSize:14,fontWeight:"bold",padding:"4px 8px",color:accent,outline:"none",background:C.white,width:80,textAlign:"center"}}/>
          <span style={{fontSize:11,color:C.textGray}}>/ 100</span>
          <input type="range" min={0} max={100} value={calificando.grade} onChange={e=>setCalificando(c=>({...c,grade:Number(e.target.value)}))} style={{flex:1,marginLeft:8}}/>
        </div>

        {/* Plantillas de feedback */}
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:10,fontWeight:"bold",color:accent}}>💬 Plantillas rápidas (clic para agregar):</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {FEEDBACK_TEMPLATES.map((t,i)=>(
              <button key={i} onClick={()=>aplicarPlantilla(t)} title={t}
                style={{...winBtn(),fontSize:9,padding:"3px 8px",maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"left"}}>
                {t.length>34?t.slice(0,34)+"…":t}
              </button>
            ))}
            <button onClick={()=>setCalificando(c=>({...c,feedback:""}))} style={{...winBtn(),fontSize:9,padding:"3px 8px",color:C.red}}>✕ Limpiar</button>
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:11,fontWeight:"bold",color:accent}}>Observaciones:</label>
          <textarea value={calificando.feedback} onChange={e=>setCalificando(c=>({...c,feedback:e.target.value}))} placeholder="Comentarios para el estudiante (use las plantillas de arriba o escriba libremente)..." rows={5} style={{...sunken,fontFamily:FONT,fontSize:11,padding:6,color:C.text,outline:"none",background:C.white,resize:"none",lineHeight:1.5}}/>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={()=>setCalificando(null)} style={winBtn()}>Cancelar</button>
          <button onClick={()=>calificarCotejo(calificando.id,calificando.grade,calificando.feedback)} style={{...winBtn(),color:accent,fontWeight:"bold"}}>✓ Guardar Calificación</button>
        </div>
      </div>
    </div>
  </div>);};

  // ─── Modales globales del DocentePanel (Fase 2) ─────────────
  const renderGlobalModals=()=>(<>
    {/* Ficha individual del estudiante */}
    {fichaEst&&(()=>{
      const misCotejos=Object.values(cotejos).filter(c=>c.owner==="estudiante"&&c.studentId===fichaEst.cedula).sort((a,b)=>(b.takenAt||"").localeCompare(a.takenAt||""));
      const calif=misCotejos.filter(c=>c.status==="calificado");
      const promed=calif.length?(calif.reduce((a,c)=>a+(c.grade||0),0)/calif.length):0;
      const enProg=misCotejos.filter(c=>c.status==="en_progreso").length;
      return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{...raised,background:C.winGray,padding:0,width:560,maxWidth:"95vw",maxHeight:"88vh",display:"flex",flexDirection:"column"}}>
          <div style={{...titleBarStyle,fontSize:12,padding:"5px 10px"}}>
            👤 Ficha de Estudiante
            <button onClick={()=>setFichaEst(null)} style={{...winBtn(),marginLeft:"auto",padding:"0 6px",minWidth:20,fontSize:11}}>✕</button>
          </div>
          <div style={{padding:14,overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>
            {/* Cabecera */}
            <div style={{...sunken,background:C.white,padding:"12px 16px",display:"flex",alignItems:"center",gap:14}}>
              <div style={{...sunken,background:accent,color:"#fff",width:50,height:50,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:"bold",fontSize:22,flexShrink:0,fontFamily:FONT}}>{fichaEst.nombre[0]}{fichaEst.apellido[0]}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:"bold",fontSize:14,color:accent}}>{fichaEst.nombre} {fichaEst.apellido}</div>
                <div style={{fontSize:10,color:C.textGray}}>C.C.: <b style={{color:C.blue,letterSpacing:1}}>{fichaEst.cedula}</b></div>
                <div style={{fontSize:9,color:C.textLight}}>Registrado: {fichaEst.date}</div>
              </div>
            </div>
            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {[
                {l:"TOTAL",v:misCotejos.length,c:C.blue},
                {l:"CALIFICADOS",v:calif.length,c:"#006400"},
                {l:"EN PROGRESO",v:enProg,c:"#aa6600"},
              ].map((s,i)=>(
                <div key={i} style={{...sunken,background:C.white,padding:"8px 6px",textAlign:"center"}}>
                  <div style={{fontSize:8,color:C.textLight,fontWeight:"bold"}}>{s.l}</div>
                  <div style={{fontSize:20,fontWeight:"bold",color:s.c,fontFamily:FONT}}>{s.v}</div>
                </div>
              ))}
            </div>
            {calif.length>0&&(<div style={{...sunken,background:"#fffff0",padding:"8px 12px",textAlign:"center"}}>
              <div style={{fontSize:9,color:"#7a6000",fontWeight:"bold",marginBottom:2}}>PROMEDIO GENERAL</div>
              <div style={{fontSize:28,fontWeight:"bold",color:promed>=80?"#006400":promed>=60?C.orange:C.red,fontFamily:FONT,lineHeight:1}}>{promed.toFixed(1)}<span style={{fontSize:14,color:C.textLight}}>/100</span></div>
            </div>)}
            {/* Lista de cotejos */}
            <div>
              <div style={{fontSize:10,fontWeight:"bold",color:accent,marginBottom:6}}>▐ COTEJOS DEL ESTUDIANTE</div>
              {misCotejos.length===0?
                <div style={{...sunken,background:C.white,padding:20,textAlign:"center",color:C.textLight,fontSize:10}}>Este estudiante aún no ha tomado ningún cotejo.</div>
                :<div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:220,overflowY:"auto"}}>
                  {misCotejos.map(c=>(
                    <div key={c.id} style={{...sunken,background:C.white,padding:"5px 10px",display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:14}}>{c.status==="calificado"?"✓":c.status==="entregado"?"⏳":"✏"}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:10,fontWeight:"bold",color:accent,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
                        <div style={{fontSize:8,color:C.textLight}}>{c.status==="calificado"?`Calificado ${c.reviewedAt}`:c.status==="entregado"?`Entregado ${c.submittedAt}`:`En progreso desde ${c.takenAt}`}</div>
                      </div>
                      {c.grade!=null&&<div style={{fontSize:14,fontWeight:"bold",color:c.grade>=60?"#006400":C.red,fontFamily:FONT,minWidth:36,textAlign:"right"}}>{c.grade}</div>}
                    </div>
                  ))}
                </div>
              }
            </div>
          </div>
          <div style={{padding:"8px 12px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>setFichaEst(null)} style={winBtn()}>Cerrar</button>
          </div>
        </div>
      </div>);
    })()}

    {/* Importar lista de estudiantes */}
    {importingEst&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{...raised,background:C.winGray,padding:0,width:560,maxWidth:"95vw",maxHeight:"90vh",display:"flex",flexDirection:"column"}}>
        <div style={{...titleBarStyle,fontSize:12,padding:"5px 10px"}}>
          📥 Importar Lista de Estudiantes
          <button onClick={()=>setImportingEst(null)} style={{...winBtn(),marginLeft:"auto",padding:"0 6px",minWidth:20,fontSize:11}}>✕</button>
        </div>
        <div style={{padding:14,overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{...sunken,background:"#fffff0",padding:"8px 12px",fontSize:10,color:"#7a6000",lineHeight:1.6}}>
            ℹ <b>Formato:</b> un estudiante por línea, separando con coma, punto y coma o tabulación.<br/>
            <b>Orden:</b> <code style={{background:"#fff",padding:"0 4px"}}>Nombre, Apellido, Cédula</code><br/>
            Ejemplo: <code style={{background:"#fff",padding:"0 4px"}}>Juan, Pérez, 1007795613</code>
          </div>
          <textarea
            value={importingEst.text}
            onChange={e=>{const t=e.target.value;const r=procesarImportEst(t);setImportingEst({text:t,...r});}}
            placeholder={"Juan, Pérez, 1007795613\nMaría, Gómez, 1098765432\nCarlos, Ruiz, 1003456789"}
            rows={7}
            style={{...sunken,fontFamily:"'Courier New',monospace",fontSize:11,padding:8,color:C.text,outline:"none",background:C.white,resize:"vertical",lineHeight:1.5}}
          />
          {/* Preview */}
          {importingEst.preview.length>0&&(
            <div style={{...sunken,background:"#e8f0e8",padding:"6px 10px",fontSize:10}}>
              <div style={{fontWeight:"bold",color:"#006400",marginBottom:4}}>✓ {importingEst.preview.length} estudiante{importingEst.preview.length===1?"":"s"} válido{importingEst.preview.length===1?"":"s"}:</div>
              <div style={{maxHeight:140,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
                {importingEst.preview.map((p,i)=>(
                  <div key={i} style={{background:"#fff",padding:"3px 6px",fontSize:10}}>
                    <b>{p.nombre} {p.apellido}</b> — C.C.: <b style={{color:C.blue}}>{p.cedula}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
          {importingEst.errors.length>0&&(
            <div style={{...sunken,background:"#fff0f0",padding:"6px 10px",fontSize:10,color:C.red}}>
              <div style={{fontWeight:"bold",marginBottom:4}}>⚠ {importingEst.errors.length} error{importingEst.errors.length===1?"":"es"}:</div>
              <div style={{maxHeight:100,overflowY:"auto",fontFamily:"'Courier New',monospace",fontSize:9}}>
                {importingEst.errors.map((er,i)=>(<div key={i}>• {er}</div>))}
              </div>
            </div>
          )}
        </div>
        <div style={{padding:"8px 12px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={()=>setImportingEst(null)} style={winBtn()}>Cancelar</button>
          <button onClick={confirmarImportEst} disabled={!importingEst.preview.length} style={{...winBtn(),fontWeight:"bold",color:importingEst.preview.length?accent:C.textLight,opacity:importingEst.preview.length?1:0.5}}>
            ✓ Importar {importingEst.preview.length||""} estudiante{importingEst.preview.length===1?"":"s"}
          </button>
        </div>
      </div>
    </div>)}


    {/* Confirmar devolver cotejo */}
    {confirmDevolver&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{...raised,background:C.winGray,padding:0,width:400}}>
        <div style={{...titleBarStyle,fontSize:11}}>↩ Devolver cotejo al estudiante</div>
        <div style={{padding:14,display:"flex",flexDirection:"column",gap:10}}>
          <div style={{...sunken,background:"#fffff0",padding:"8px 12px",fontSize:10,color:"#7a6000",lineHeight:1.6}}>
            El cotejo <b>"{confirmDevolver.name}"</b> volverá al estado <b>"en progreso"</b> del estudiante. La calificación previa (si la tenía) se borrará.
          </div>
          <label style={{fontSize:10,fontWeight:"bold",color:accent}}>Motivo / observación (opcional):</label>
          <textarea
            id="motivoDevolver"
            placeholder="Ej: Faltan puntos en muestra B. Revise y vuelva a entregar."
            rows={3}
            style={{...sunken,fontFamily:FONT,fontSize:11,padding:6,color:C.text,outline:"none",background:C.white,resize:"none"}}
          />
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={()=>setConfirmDevolver(null)} style={winBtn()}>Cancelar</button>
            <button onClick={()=>{const t=document.getElementById("motivoDevolver");devolverCotejo(confirmDevolver.id,t?.value||"");}} style={{...winBtn(),color:"#aa6600",fontWeight:"bold"}}>↩ Sí, devolver</button>
          </div>
        </div>
      </div>
    </div>)}

    {/* Resetear cédula/contraseña del estudiante */}
    {confirmResetPass&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{...raised,background:C.winGray,padding:0,width:420}}>
        <div style={{...titleBarStyle,fontSize:11}}>🔑 Resetear usuario / contraseña</div>
        <div style={{padding:14,display:"flex",flexDirection:"column",gap:10}}>
          <div style={{...sunken,background:"#fffff0",padding:"8px 12px",fontSize:10,color:"#7a6000",lineHeight:1.6}}>
            Escriba la <b>nueva contraseña</b> para <b>{confirmResetPass.est.nombre} {confirmResetPass.est.apellido}</b> (mínimo 6 caracteres). El estudiante deberá cambiarla al ingresar.<br/>
            Usuario (cédula): <b style={{color:C.blue,letterSpacing:1}}>{confirmResetPass.est.cedula}</b>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"130px 1fr",alignItems:"center",gap:8}}>
            <label style={{fontSize:11,fontWeight:"bold",color:accent,textAlign:"right"}}>Nueva contraseña:</label>
            <input
              value={confirmResetPass.nueva}
              onChange={e=>setConfirmResetPass(c=>({...c,nueva:e.target.value}))}
              placeholder="Mínimo 6 caracteres"
              maxLength={30}
              autoFocus
              style={{...sunken,fontFamily:FONT,fontSize:13,fontWeight:"bold",padding:"4px 8px",color:C.blue,outline:"none",background:C.white,letterSpacing:1}}
            />
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={()=>setConfirmResetPass(null)} style={winBtn()}>Cancelar</button>
            <button onClick={()=>resetearPassEstudiante(confirmResetPass.est,confirmResetPass.nueva)} style={{...winBtn(),color:"#aa6600",fontWeight:"bold"}}>🔑 Cambiar contraseña</button>
          </div>
        </div>
      </div>
    </div>)}

    {/* Renombrar cotejo modelo */}
    {renaming&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{...raised,background:C.winGray,padding:0,width:400}}>
        <div style={{...titleBarStyle,fontSize:11}}>✏ Renombrar cotejo</div>
        <div style={{padding:14,display:"flex",flexDirection:"column",gap:10}}>
          <label style={{fontSize:11,fontWeight:"bold",color:accent}}>Nuevo nombre:</label>
          <input
            value={renaming.newName}
            onChange={e=>setRenaming(r=>({...r,newName:e.target.value}))}
            onKeyDown={e=>{if(e.key==="Enter") renombrarCotejo(); if(e.key==="Escape") setRenaming(null);}}
            autoFocus
            style={{...sunken,fontFamily:FONT,fontSize:12,padding:"5px 8px",background:C.white,outline:"none"}}/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={()=>setRenaming(null)} style={winBtn()}>Cancelar</button>
            <button onClick={renombrarCotejo} disabled={!renaming.newName?.trim()} style={{...winBtn(),color:accent,fontWeight:"bold",opacity:renaming.newName?.trim()?1:0.5}}>✓ Guardar</button>
          </div>
        </div>
      </div>
    </div>)}

    {/* Publicar con plazo opcional */}
    {publicandoConPlazo&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{...raised,background:C.winGray,padding:0,width:460}}>
        <div style={{...titleBarStyle,fontSize:11}}>📢 Publicar cotejo</div>
        <div style={{padding:14,display:"flex",flexDirection:"column",gap:10}}>
          <div style={{...sunken,background:"#e8f0e8",padding:"8px 12px",fontSize:10,color:"#006400",lineHeight:1.6}}>
            <b>{publicandoConPlazo.name}</b><br/>Quedará disponible para todos los estudiantes registrados.
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:11,fontWeight:"bold",color:accent}}>📅 Fecha límite (opcional):</label>
            <input
              type="date"
              value={publicandoConPlazo.deadline}
              onChange={e=>setPublicandoConPlazo(p=>({...p,deadline:e.target.value}))}
              style={{...sunken,fontFamily:FONT,fontSize:12,padding:"4px 8px",color:C.text,outline:"none",background:C.white}}
            />
            <span style={{fontSize:9,color:C.textLight}}>Si no la define, no habrá plazo de entrega.</span>
          </div>
          {publicandoConPlazo.deadline&&<div style={{display:"flex",flexDirection:"column",gap:6,...sunken,background:"#fffff0",padding:"10px 12px"}}>
            <label style={{fontSize:11,fontWeight:"bold",color:"#7a6000"}}>⚙ Comportamiento al vencer:</label>
            {[
              {k:false,t:"⏰ Permisivo",d:"Se puede entregar después del plazo, pero queda marcado como 'entrega tardía'."},
              {k:true,t:"🔒 Estricto",d:"No se permite entregar después de la fecha límite. El cotejo queda bloqueado."},
            ].map(opt=>(
              <label key={String(opt.k)} style={{display:"flex",alignItems:"flex-start",gap:8,cursor:"pointer",padding:"4px 6px",background:publicandoConPlazo.strict===opt.k?"#fff":"transparent",border:publicandoConPlazo.strict===opt.k?`1px solid ${C.border}`:"1px solid transparent"}}>
                <input type="radio" name="strict" checked={publicandoConPlazo.strict===opt.k} onChange={()=>setPublicandoConPlazo(p=>({...p,strict:opt.k}))} style={{marginTop:2}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:"bold",color:opt.k?"#aa0000":"#aa6600"}}>{opt.t}</div>
                  <div style={{fontSize:9,color:C.textGray,lineHeight:1.4}}>{opt.d}</div>
                </div>
              </label>
            ))}
          </div>}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={()=>setPublicandoConPlazo(null)} style={winBtn()}>Cancelar</button>
            <button onClick={()=>publicarConPlazo(publicandoConPlazo.cotejoId,publicandoConPlazo.deadline,publicandoConPlazo.strict)} style={{...winBtn(),color:accent,fontWeight:"bold"}}>📢 Publicar</button>
          </div>
        </div>
      </div>
    </div>)}
  </>);

  // ─── VISTA: GALERÍA ───
  // ─── VISTA: GALERÍA ───
  if(view==="galeria") return(
    <div style={{background:C.winGray,minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
      {renderHeader("Galería de Imágenes")}
      <div style={{flex:1,...sunken,margin:8,background:C.winGray,padding:12,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <span style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:accent}}>▐ MIS IMÁGENES</span>
          <label style={{...winBtn(),cursor:"pointer",marginLeft:"auto"}}>📂 Subir Imagen<input type="file" accept="image/*" onChange={uploadImage} style={{display:"none"}}/></label>
        </div>
        <div style={{...sunken,background:C.white,padding:"6px 10px",marginBottom:10,fontSize:10}}>ℹ Suba aquí las imágenes de huellas dactilares para usarlas en sus cotejos modelo. Sus imágenes son exclusivas de su panel.</div>
        {imgList.length===0&&<div style={{padding:40,textAlign:"center",color:C.textLight}}>No tiene imágenes. Suba imágenes de huellas dactilares para crear cotejos modelo.</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
          {imgList.map(img=>(<div key={img.id} style={{background:C.winGray,...raised,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{height:130,background:"#eee",overflow:"hidden"}}>
              <img src={img.src} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            </div>
            <div style={{padding:"6px 8px",display:"flex",flexDirection:"column",gap:3}}>
              <span style={{fontSize:10,overflow:"hidden",whiteSpace:"nowrap"}}>{img.name}</span>
              <span style={{fontSize:9,color:C.textLight}}>{img.date}</span>
              <button onClick={()=>setConfirmDel(img.id)} style={{...winBtn(),fontSize:9,padding:"2px 4px",color:C.red}}>🗑 Eliminar</button>
            </div>
          </div>))}
        </div>
      </div>
      {renderConfirmDel()}
      {renderGlobalModals()}
      {renderFooter()}
    </div>
  );

  // ─── VISTA: COTEJOS MODELO ───
  if(view==="cotejos") return(
    <div style={{background:C.winGray,minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
      {renderHeader("Cotejos Modelo")}
      <div style={{flex:1,...sunken,margin:8,background:C.winGray,padding:12,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:accent}}>▐ COTEJOS MODELO</span>
          <button onClick={()=>setNewCotejo({name:"",imgA:null,imgB:null})} style={{...winBtn(),marginLeft:"auto"}}>+ Nuevo Cotejo</button>
        </div>
        <div style={{...sunken,background:C.white,padding:"6px 10px",marginBottom:10,fontSize:10}}>ℹ Los cotejos modelo son plantillas de referencia. Su avance se guarda automáticamente como <b>✏ EN PROGRESO</b>; abra el cotejo y presione <b>✓ Finalizar</b> cuando termine de marcar los puntos. Solo los cotejos <b>✓ TERMINADOS</b> pueden publicarse a los estudiantes.</div>
        {newCotejo&&(<div style={{...raised,background:C.winGray,padding:12,marginBottom:12}}>
          <div style={{...titleBarStyle,marginBottom:8,fontSize:11}}>▐ NUEVO COTEJO MODELO</div>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
            <label style={{fontSize:11}}>Nombre del Cotejo:</label>
            <input value={newCotejo.name} onChange={e=>setNewCotejo(n=>({...n,name:e.target.value}))} placeholder="Ej: Práctica 01 — Huellas latentes" style={{...sunken,fontFamily:FONT,fontSize:11,padding:"3px 6px",color:C.text,outline:"none",background:C.white,width:"100%",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:10}}>
            {["A","B"].map(s=>{const sel=newCotejo[s==="A"?"imgA":"imgB"],img=sel?images[sel]:null;return(<div key={s}><div style={{fontWeight:"bold",fontSize:11,marginBottom:4,color:accent}}>Muestra {s}:</div>
              <div onClick={()=>setPickingFor(s)} style={{...sunken,height:100,background:C.white,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",overflow:"hidden",position:"relative"}}>
                {img?<><img src={img.src} style={{width:"100%",height:"100%",objectFit:"cover"}}/><div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,100,0.7)",color:"#fff",fontSize:9,fontFamily:FONT,padding:"2px 4px",overflow:"hidden",whiteSpace:"nowrap"}}>{img.name}</div></> :<span style={{fontSize:10,color:C.textLight}}>[Clic para seleccionar]</span>}
              </div></div>);})}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>setNewCotejo(null)} style={winBtn()}>Cancelar</button>
            <button onClick={createCotejo} disabled={!newCotejo.name||!newCotejo.imgA||!newCotejo.imgB} style={{...winBtn(),opacity:!newCotejo.name||!newCotejo.imgA||!newCotejo.imgB?0.5:1}}>✓ Crear y Abrir</button>
          </div>
        </div>)}
        {pickingFor&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{...raised,background:C.winGray,padding:0,width:520,maxHeight:"75vh",display:"flex",flexDirection:"column"}}>
            <div style={{...titleBarStyle,padding:"4px 10px"}}>Seleccionar imagen — Muestra {pickingFor}<button onClick={()=>setPickingFor(null)} style={{...winBtn(false),marginLeft:"auto",padding:"0 6px",minWidth:20}}>✕</button></div>
            <div style={{padding:10,overflowY:"auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              {imgList.length===0&&<span style={{fontSize:11,color:C.textLight,gridColumn:"span 4"}}>No hay imágenes. Suba imágenes en la Galería primero.</span>}
              {imgList.map(img=>(<div key={img.id} onClick={()=>{setNewCotejo(n=>({...n,[pickingFor==="A"?"imgA":"imgB"]:img.id}));setPickingFor(null);}} style={{...raised,cursor:"pointer",background:C.white,overflow:"hidden"}}><img src={img.src} style={{width:"100%",height:70,objectFit:"cover",display:"block"}}/><div style={{padding:"3px 4px",fontSize:9,fontFamily:FONT,overflow:"hidden",whiteSpace:"nowrap"}}>{img.name}</div></div>))}
            </div>
            <div style={{padding:"6px 10px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end"}}><button onClick={()=>setPickingFor(null)} style={winBtn()}>Cancelar</button></div>
          </div>
        </div>)}
        {cotejoList.length===0&&!newCotejo&&<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:12}}>No hay cotejos modelo. Cree uno con el botón "+ Nuevo Cotejo".</div>}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {cotejoList.map(c=>{const iA=images[c.imgA],iB=images[c.imgB];const pairs=[...new Set([...(c.leftShapes||[]),...(c.rightShapes||[])].map(s=>s.label).filter(Boolean))].filter(l=>(c.leftShapes||[]).some(s=>s.label===l)&&(c.rightShapes||[]).some(s=>s.label===l)).length;
            return(<div key={c.id} style={{...raised,display:"flex",alignItems:"stretch",background:C.winGray}}>
              <div style={{display:"flex",flexShrink:0}}>{[iA,iB].map((img,i)=>(<div key={i} style={{width:72,height:72,background:"#eee",overflow:"hidden",borderRight:`1px solid ${C.border}`,flexShrink:0}}>{img&&<img src={img.src} style={{width:"100%",height:"100%",objectFit:"cover"}}/>}</div>))}</div>
              <div style={{flex:1,padding:"6px 12px",display:"flex",flexDirection:"column",justifyContent:"center",gap:2}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontWeight:"bold",fontSize:12,color:accent}}>{c.name}</span>
                  {c.finalizado
                    ? <span style={{fontSize:8,fontWeight:"bold",background:"#006400",color:"#fff",padding:"1px 6px",letterSpacing:0.5}}>✓ TERMINADO</span>
                    : <span style={{fontSize:8,fontWeight:"bold",background:"#aa6600",color:"#fff",padding:"1px 6px",letterSpacing:0.5}}>✏ EN PROGRESO</span>}
                  {c.published&&<span style={{fontSize:8,fontWeight:"bold",background:accent,color:"#fff",padding:"1px 6px",letterSpacing:0.5}}>📢 PUBLICADO</span>}
                </div>
                <span style={{fontSize:10,color:C.textGray}}>A: {iA?.name||"?"} | B: {iB?.name||"?"}</span>
                <span style={{fontSize:9,color:C.textLight}}>{c.date}</span>
              </div>
              <div style={{padding:"6px 12px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderLeft:`1px solid ${C.border}`,gap:2,flexShrink:0}}>
                <span style={{fontSize:9,color:C.textLight}}>PARES</span>
                <span style={{fontWeight:"bold",fontSize:18,color:accent}}>{pairs}</span>
                {c.deadline&&<span style={{fontSize:8,color:"#aa6600",marginTop:2}}>📅 {c.deadline}</span>}
              </div>
              <div style={{padding:"6px 10px",display:"flex",flexDirection:"column",justifyContent:"center",gap:3,borderLeft:`1px solid ${C.border}`,flexShrink:0,minWidth:130}}>
                <button onClick={()=>setCotejoId(c.id)} style={{...winBtn(),fontSize:10}}>▶ Abrir</button>
                {c.published
                  ? <button onClick={()=>togglePublish(c.id)} style={{...winBtn(true),fontSize:10}}>🔒 Ocultar</button>
                  : (c.finalizado
                      ? <button onClick={()=>setPublicandoConPlazo({cotejoId:c.id,name:c.name,deadline:"",strict:false})} style={{...winBtn(),fontSize:10,color:accent}}>📢 Publicar</button>
                      : <button disabled title="Debe abrir el cotejo y presionar '✓ Finalizar' antes de poder publicarlo" style={{...winBtn(),fontSize:10,color:C.textLight,opacity:0.55,cursor:"not-allowed"}}>🔒 Termínelo 1ro</button>)
                }
                <button onClick={()=>duplicarCotejo(c)} style={{...winBtn(),fontSize:10,color:C.blue}}>📑 Duplicar</button>
                <button onClick={()=>setRenaming({id:c.id,newName:c.name})} style={{...winBtn(),fontSize:10}}>✏ Renombrar</button>
                <button onClick={()=>setConfirmDel(c.id)} style={{...winBtn(),fontSize:10,color:C.red}}>🗑 Borrar</button>
              </div>
            </div>);})}
        </div>
      </div>
      {renderConfirmDel()}
      {renderGlobalModals()}
      {renderFooter()}
    </div>
  );

  // ─── VISTA: ESTUDIANTES ───
  if(view==="estudiantes"){
    const estudiantesListFull=Object.values(store.estudiantes||{}).sort((a,b)=>a.apellido.localeCompare(b.apellido));
    const estudiantesList=searchEstudiantes.trim()
      ? estudiantesListFull.filter(e=>{
          const q=searchEstudiantes.toLowerCase();
          return (e.nombre||"").toLowerCase().includes(q) || (e.apellido||"").toLowerCase().includes(q) || (e.cedula||"").includes(q);
        })
      : estudiantesListFull;
    return(
    <div style={{background:C.winGray,minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
      {renderHeader("Estudiantes")}
      <div style={{flex:1,...sunken,margin:8,background:C.winGray,padding:12,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <span style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:accent}}>▐ ESTUDIANTES REGISTRADOS ({estudiantesListFull.length})</span>
          <input
            value={searchEstudiantes}
            onChange={e=>setSearchEstudiantes(e.target.value)}
            placeholder="🔍 Buscar por nombre o cédula..."
            style={{...sunken,fontFamily:FONT,fontSize:10,padding:"3px 8px",background:C.white,outline:"none",width:220}}/>
          <button onClick={()=>setImportingEst({text:"",preview:[],errors:[]})} style={{...winBtn(),marginLeft:"auto",color:C.blue}}>📥 Importar Lista</button>
          <button onClick={()=>{setNewEstudiante({nombre:"",apellido:"",cedula:""});setEstErr("");}} style={{...winBtn()}}>+ Agregar Estudiante</button>
        </div>

        {/* Modal agregar estudiante */}
        {newEstudiante&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{...raised,background:C.winGray,padding:0,width:420,maxWidth:"95vw"}}>
            <div style={{...titleBarStyle,fontSize:12,padding:"5px 10px"}}>
              👤 Registrar Nuevo Estudiante
              <button onClick={()=>setNewEstudiante(null)} style={{...winBtn(),marginLeft:"auto",padding:"0 6px",minWidth:20,fontSize:11}}>✕</button>
            </div>
            <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{...sunken,background:"#fffff0",padding:"6px 10px",fontSize:10,color:"#7a6000",lineHeight:1.6}}>
                ℹ La <b>Cédula</b> será el <b>usuario</b> del estudiante, y usted define su <b>contraseña inicial</b> (mínimo 6 caracteres). El estudiante deberá cambiarla en su primer ingreso.
              </div>
              {[{l:"Nombre:",k:"nombre",p:"Ej: Juan"},{l:"Apellido:",k:"apellido",p:"Ej: Pérez"}].map(f=>(
                <div key={f.k} style={{display:"grid",gridTemplateColumns:"130px 1fr",alignItems:"center",gap:8}}>
                  <label style={{fontSize:11,fontWeight:"bold",color:accent,textAlign:"right"}}>{f.l}</label>
                  <input value={newEstudiante[f.k]} onChange={e=>setNewEstudiante(n=>({...n,[f.k]:e.target.value}))} placeholder={f.p} autoComplete="off"
                    style={{...sunken,fontFamily:FONT,fontSize:12,padding:"4px 8px",color:C.text,outline:"none",background:C.white}}/>
                </div>
              ))}
              <div style={{display:"grid",gridTemplateColumns:"130px 1fr",alignItems:"center",gap:8}}>
                <label style={{fontSize:11,fontWeight:"bold",color:accent,textAlign:"right"}}>C.C. (Usuario):</label>
                <input value={newEstudiante.cedula} onChange={e=>setNewEstudiante(n=>({...n,cedula:e.target.value.replace(/\D/g,"")}))} placeholder="Ej: 1007795613" maxLength={12} autoComplete="off"
                  style={{...sunken,fontFamily:FONT,fontSize:13,fontWeight:"bold",padding:"4px 8px",color:C.blue,outline:"none",background:C.white,letterSpacing:1}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"130px 1fr",alignItems:"center",gap:8}}>
                <label style={{fontSize:11,fontWeight:"bold",color:accent,textAlign:"right"}}>Contraseña inicial:</label>
                <input value={newEstudiante.pass||""} onChange={e=>setNewEstudiante(n=>({...n,pass:e.target.value}))} placeholder="Mínimo 6 caracteres" maxLength={30} autoComplete="off"
                  style={{...sunken,fontFamily:FONT,fontSize:13,fontWeight:"bold",padding:"4px 8px",color:"#006400",outline:"none",background:C.white,letterSpacing:1}}/>
              </div>
              {newEstudiante.cedula&&newEstudiante.nombre&&newEstudiante.apellido&&(
                <div style={{...sunken,background:"#e8f0e8",padding:"8px 12px",fontSize:10,color:accent,lineHeight:1.8,position:"relative"}}>
                  <b>Vista previa de acceso:</b>
                  <button onClick={()=>{
                    const txt=`Estudiante: ${newEstudiante.nombre.trim()} ${newEstudiante.apellido.trim()}
Usuario: ${newEstudiante.cedula}
Contraseña: ${newEstudiante.pass||"(sin definir)"}`;
                    if(navigator.clipboard){
                      navigator.clipboard.writeText(txt).then(()=>flash("✓ Credenciales copiadas")).catch(()=>flash("⚠ No se pudo copiar"));
                    } else {
                      flash("⚠ Clipboard no disponible");
                    }
                  }} style={{...winBtn(),fontSize:9,padding:"2px 8px",position:"absolute",top:6,right:6}}>📋 Copiar</button>
                  <br/>
                  👤 <b>{newEstudiante.nombre.trim()} {newEstudiante.apellido.trim()}</b><br/>
                  🔑 Usuario: <b>{newEstudiante.cedula}</b> · Contraseña: <b>{newEstudiante.pass||"(sin definir)"}</b>
                </div>
              )}
              {estErr&&<div style={{background:"#ffcccc",border:"1px solid #cc0000",padding:"5px 10px",fontSize:10,color:C.red,textAlign:"center"}}>{estErr}</div>}
              <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:4}}>
                <button onClick={()=>setNewEstudiante(null)} style={winBtn()}>Cancelar</button>
                <button onClick={createEstudiante} style={{...winBtn(),fontWeight:"bold",color:accent}}>✓ Registrar Estudiante</button>
              </div>
            </div>
          </div>
        </div>)}

        {/* Confirmar eliminar estudiante */}
        {credencialModal&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:350,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{...raised,background:C.winGray,width:440,maxWidth:"95vw",fontFamily:FONT}}>
            <div style={{...titleBarStyle,fontSize:12}}>🔑 {credencialModal.esReset?"Nueva clave temporal generada":"Estudiante creado — credenciales de acceso"}</div>
            <div style={{padding:18,display:"flex",flexDirection:"column",gap:12}}>
              <div style={{fontSize:11}}>Entregue estos datos a <b>{credencialModal.nombre} {credencialModal.apellido}</b>:</div>
              <div style={{...sunken,background:"#000",color:"#33ff33",padding:"14px 16px",fontSize:15,lineHeight:2,fontFamily:"Courier New, monospace",letterSpacing:1}}>
                Usuario:&nbsp;&nbsp;&nbsp;&nbsp;<b>{credencialModal.cedula}</b><br/>
                Contraseña:&nbsp;<b style={{fontSize:18}}>{credencialModal.tempPass}</b>
              </div>
              <div style={{...sunken,background:"#fffff0",padding:"8px 12px",fontSize:10,color:"#7a6000",lineHeight:1.6}}>
                ⚠ <b>Anote la contraseña AHORA</b> — distingue mayúsculas de minúsculas y no se volverá a mostrar. El estudiante deberá cambiarla en su primer ingreso. Si se pierde, use el botón 🔑 para generar otra.
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{try{navigator.clipboard.writeText(`SIMUSID — Acceso\nUsuario: ${credencialModal.cedula}\nContraseña temporal: ${credencialModal.tempPass}`);flash("✓ Copiado al portapapeles");}catch(e){}}} style={{...winBtn(),flex:1,padding:"8px 0"}}>📋 Copiar credenciales</button>
                <button onClick={()=>setCredencialModal(null)} style={{...winBtn(),flex:1,padding:"8px 0",fontWeight:"bold"}}>✓ Ya las anoté</button>
              </div>
            </div>
          </div>
        </div>)}
        {confirmDelEst&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{...raised,background:C.winGray,padding:0,width:340}}>
            <div style={{...titleBarStyle,fontSize:11}}>⚠ Confirmar eliminación</div>
            <div style={{padding:16,display:"flex",flexDirection:"column",gap:12,alignItems:"center"}}>
              <span style={{fontSize:11,textAlign:"center"}}>¿Eliminar a <b>{confirmDelEst.nombre} {confirmDelEst.apellido}</b>?<br/><span style={{color:C.textLight}}>Esta acción no se puede deshacer.</span></span>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setConfirmDelEst(null)} style={winBtn()}>Cancelar</button>
                <button onClick={async()=>{try{await api.deleteStudent(confirmDelEst.cedula);setStore(loadStore());logEvent("usuario","borrar",`Estudiante ${confirmDelEst.nombre} ${confirmDelEst.apellido} eliminado`,"docente");setConfirmDelEst(null);flash("✓ Estudiante eliminado");}catch(err){flash("⚠ "+(err.message||"Error"));setConfirmDelEst(null);}}} style={{...winBtn(),color:C.red}}>Sí, Eliminar</button>
              </div>
            </div>
          </div>
        </div>)}

        {/* Lista de estudiantes */}
        {estudiantesList.length===0&&!newEstudiante&&(
          <div style={{...sunken,background:C.white,padding:30,textAlign:"center",color:C.textLight,fontSize:11}}>
            {searchEstudiantes.trim()
              ? <>🔍 Ningún estudiante coincide con "<b>{searchEstudiantes}</b>".</>
              : <>No hay estudiantes registrados.<br/>Use el botón <b>+ Agregar Estudiante</b> para registrar uno.</>}
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {estudiantesList.map((est,i)=>{
            const misEntregas=Object.values(cotejos).filter(c=>c.owner==="estudiante"&&c.studentId===est.cedula);
            const calif=misEntregas.filter(c=>c.status==="calificado");
            const promed=calif.length?(calif.reduce((a,c)=>a+(c.grade||0),0)/calif.length):0;
            return(
            <div key={est.id} style={{...raised,display:"flex",alignItems:"center",background:C.winGray,padding:"8px 12px",gap:12}}>
              <div style={{...sunken,background:accent,color:"#fff",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:"bold",fontSize:12,flexShrink:0}}>{i+1}</div>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:2,cursor:"pointer"}} onClick={()=>setFichaEst(est)}>
                <div style={{fontWeight:"bold",fontSize:12,color:accent}}>{est.nombre} {est.apellido}</div>
                <div style={{fontSize:10,color:C.textGray}}>C.C.: <b style={{color:C.blue,letterSpacing:1}}>{est.cedula}</b> &nbsp;·&nbsp; Registrado: {est.date}</div>
                {misEntregas.length>0&&<div style={{fontSize:9,color:C.textLight}}>{misEntregas.length} cotejo{misEntregas.length===1?"":"s"} · {calif.length} calificado{calif.length===1?"":"s"} {calif.length>0?`(prom. ${promed.toFixed(1)})`:""}</div>}
              </div>
              <div style={{...sunken,background:"#e8f0e8",padding:"4px 10px",fontSize:10,color:accent,textAlign:"center",flexShrink:0}}>
                <div style={{fontSize:9,color:C.textLight}}>USUARIO</div>
                <div style={{fontWeight:"bold",letterSpacing:1}}>{est.cedula}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:3,flexShrink:0}}>
                <button onClick={()=>setFichaEst(est)} style={{...winBtn(),fontSize:9,padding:"3px 8px",fontWeight:"bold",color:C.blue}}>👁 Ficha</button>
                <button onClick={()=>setConfirmResetPass({est,nueva:""})} style={{...winBtn(),fontSize:9,padding:"3px 8px",color:"#aa6600"}}>🔑 Resetear</button>
                <button onClick={()=>setConfirmDelEst(est)} style={{...winBtn(),fontSize:9,padding:"3px 8px",color:C.red}}>🗑 Eliminar</button>
              </div>
            </div>
          );})}
        </div>
      </div>
      {renderGlobalModals()}
      {renderFooter()}
    </div>
  );}


  // ─── VISTA: REVISAR ───
  if(view==="revisar") return(
    <div style={{background:C.winGray,minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
      {renderHeader("Revisar Cotejos")}
      <div style={{flex:1,...sunken,margin:8,background:C.winGray,padding:12,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <span style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:accent}}>▐ COTEJOS POR REVISAR</span>
          <div style={{marginLeft:"auto",display:"flex",gap:2}}>
            {[{k:"pendientes",l:`Pendientes (${pendientes.length})`},{k:"calificados",l:`Calificados (${calificadas.length})`},{k:"todos",l:`Todos (${entregas.length})`}].map(f=>(
              <button key={f.k} onClick={()=>setRevisarFilter(f.k)} style={{...winBtn(revisarFilter===f.k),fontSize:10}}>{f.l}</button>
            ))}
          </div>
        </div>
        <div style={{...sunken,background:C.white,padding:"6px 10px",marginBottom:10,fontSize:10}}>ℹ Acciones: <b>👁 Ver Trabajo</b> abre el cotejo · <b>✏ Calificar</b> asigna nota · <b>↩ Devolver</b> regresa al estudiante · <b>📄 PDF</b> descarga el acta de práctica en PDF.</div>
        {visiblesRevisar.length===0&&<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:11}}>{revisarFilter==="pendientes"?"No hay cotejos pendientes de calificación.":revisarFilter==="calificados"?"Aún no ha calificado ningún cotejo.":"Ningún estudiante ha entregado cotejos todavía."}</div>}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {visiblesRevisar.map(c=>{const iA=images[c.imgA],iB=images[c.imgB];const modelo=c.parentId?cotejos[c.parentId]:null;const sp=pairsOf(c);const mp=modelo?pairsOf(modelo):0;
            return(<div key={c.id} style={{...raised,display:"flex",alignItems:"stretch",background:C.winGray}}>
              <div style={{display:"flex",flexShrink:0}}>{[iA,iB].map((img,i)=>(<div key={i} style={{width:72,height:72,background:"#eee",overflow:"hidden",borderRight:`1px solid ${C.border}`,flexShrink:0}}>{img&&<img src={img.src} style={{width:"100%",height:"100%",objectFit:"cover"}}/>}</div>))}</div>
              <div style={{flex:1,padding:"6px 12px",display:"flex",flexDirection:"column",justifyContent:"center",gap:2,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontWeight:"bold",fontSize:12,color:accent}}>{c.name}</span>
                  {c.status==="calificado"?<span style={{fontSize:8,fontWeight:"bold",background:accent,color:"#fff",padding:"1px 6px",letterSpacing:0.5}}>✓ CALIFICADO</span>:<span style={{fontSize:8,fontWeight:"bold",background:C.orange,color:"#fff",padding:"1px 6px",letterSpacing:0.5}}>⏳ PENDIENTE</span>}
                </div>
                <span style={{fontSize:10,color:C.textGray}}>👤 <b>{(()=>{const est=Object.values(store.estudiantes||{}).find(e=>e.cedula===c.studentId);return est?`${est.nombre} ${est.apellido} (${c.studentId})`:c.studentId;})()}</b> · Entregado: {c.submittedAt||"?"}</span>
                {c.status==="calificado"&&<span style={{fontSize:10,color:accent,fontWeight:"bold"}}>📝 Nota: {c.grade}/100{c.feedback?` — ${c.feedback.length>50?c.feedback.slice(0,50)+"…":c.feedback}`:""}</span>}
                {c.returnedAt&&<span style={{fontSize:9,color:"#aa6600",fontStyle:"italic"}}>↩ Fue devuelto el {c.returnedAt}</span>}
              </div>
              <div style={{padding:"6px 10px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderLeft:`1px solid ${C.border}`,gap:2,flexShrink:0}}>
                <span style={{fontSize:9,color:C.textLight}}>EST. / MOD.</span>
                <span style={{fontFamily:FONT,fontSize:13,fontWeight:"bold"}}><span style={{color:accent}}>{sp}</span> <span style={{color:C.textLight}}>/</span> <span style={{color:C.textGray}}>{mp}</span></span>
              </div>
              <div style={{padding:"6px 10px",display:"flex",flexDirection:"column",justifyContent:"center",gap:3,borderLeft:`1px solid ${C.border}`,flexShrink:0,minWidth:150}}>
                <button onClick={()=>setCotejoId(c.id)} style={{...winBtn(),fontSize:10}}>👁 Ver Trabajo</button>
                <button onClick={()=>setCalificando({id:c.id,cotejo:c,grade:c.grade??80,feedback:c.feedback??""})} style={{...winBtn(c.status==="calificado"),fontSize:10,fontWeight:"bold",color:accent}}>{c.status==="calificado"?"✏ Recalificar":"✏ Calificar"}</button>
                {c.status==="calificado"&&<button onClick={()=>setConfirmDevolver(c)} style={{...winBtn(),fontSize:10,color:"#aa6600"}}>↩ Devolver</button>}
                <button onClick={async()=>{
                  try{
                    flash("⏳ Generando PDF...");
                    const est=Object.values(store.estudiantes||{}).find(e=>e.cedula===c.studentId);
                    await exportCotejoPDF(c, store, est);
                    flash("✓ PDF descargado");
                  }catch(err){
                    flash("⚠ Error al generar PDF");
                  }
                }} style={{...winBtn(),fontSize:10,color:"#7a0000",fontWeight:"bold"}}>📄 PDF</button>
              </div>
            </div>);})}
        </div>
      </div>
      {renderCalificarModal()}
      {renderGlobalModals()}
      {renderFooter()}
    </div>
  );


  // ─── DASHBOARD ───
  const cards=[
    {icon:"📂",t:"Galería de Imágenes",sub:"Subir y gestionar mis huellas",n:imgList.length,view:"galeria"},
    {icon:"📝",t:"Cotejos Modelo",sub:"Crear plantillas de práctica",n:cotejoList.filter(c=>c.owner==="docente"&&!c.esGuia).length,view:"cotejos"},
    {icon:"👥",t:"Estudiantes",sub:estudiantesUnicos>0?`${estudiantesUnicos} registrado${estudiantesUnicos===1?"":"s"}`:"Sin registros",n:estudiantesUnicos,view:"estudiantes"},
    {icon:"✓",t:"Revisar Cotejos",sub:pendientes.length>0?`${pendientes.length} pendiente${pendientes.length===1?"":"s"} de revisar`:"Sin pendientes",n:pendientes.length,view:"revisar"},
  ];
  return(
    <div style={{background:C.winGray,minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
      {renderHeader()}
      <div style={{flex:1,...sunken,margin:8,background:C.winGray,padding:16,overflowY:"auto"}}>
        <div style={{marginBottom:16,paddingBottom:10,borderBottom:`1px solid ${C.border}`}}>
          <div style={{...raised,background:C.white,padding:"10px 14px",display:"flex",alignItems:"center",gap:12}}>
            <FpLogo size={40} stroke={accent}/>
            <div>
              <div style={{fontSize:14,fontWeight:"bold",color:accent,letterSpacing:1}}>BIENVENIDO — DOCENTE</div>
              <div style={{fontSize:10,color:C.textGray,marginTop:2}}>Panel de revisión y evaluación de cotejos dactiloscópicos</div>
            </div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10,marginBottom:16}}>
          {cards.map((c,i)=>(
            <button key={i} onClick={()=>setView(c.view)} style={{...raised,background:C.winGray,padding:"14px 16px",display:"flex",flexDirection:"column",gap:6,cursor:"pointer",fontFamily:FONT,textAlign:"left",alignItems:"stretch"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:28}}>{c.icon}</span>
                <span style={{fontSize:24,fontWeight:"bold",color:accent,fontFamily:FONT}}>{c.n}</span>
              </div>
              <div style={{fontSize:11,color:C.text,fontWeight:"bold"}}>{c.t}</div>
              <div style={{fontSize:9,color:C.textLight}}>{c.sub}</div>
              <div style={{fontSize:9,color:accent,marginTop:2}}>▶ Abrir →</div>
            </button>
          ))}
        </div>
        <div style={{...sunken,background:C.white,padding:"12px 16px",fontSize:11,color:C.textGray,lineHeight:1.7}}>
          <div style={{fontSize:11,fontWeight:"bold",color:accent,marginBottom:4}}>▐ FLUJO DE TRABAJO</div>
          <b style={{color:C.text}}>1.</b> Suba imágenes de huellas en <b>Galería</b>. &nbsp;
          <b style={{color:C.text}}>2.</b> Cree un <b>Cotejo Modelo</b> seleccionando dos imágenes y marque los puntos de referencia. &nbsp;
          <b style={{color:C.text}}>3.</b> <b>Publique</b> el cotejo para que los estudiantes puedan tomarlo. &nbsp;
          <b style={{color:C.text}}>4.</b> Revise y califique las entregas en <b>Revisar Cotejos</b>.
        </div>
      </div>
      {renderGlobalModals()}
      {renderFooter()}
    </div>
  );
}

// ── VISTA: PRÁCTICA LIBRE (Estudiante) ────────────────────────────
// Selección de dos huellas de la galería para practicar marcado de minucias
// sin el flujo ACE-V estricto. Incluye acceso a prácticas libres en curso.
function PracticaLibreView({images,renderHeader,renderFooter,onIniciar,enProgresoLibres,onAbrir}){
  const [selA,setSelA]=useState(null);
  const [selB,setSelB]=useState(null);
  const imgs=Object.values(images).filter(i=>!i.esGuia);
  const galeria=imgs.length>0?imgs:Object.values(images); // si solo están las guía, mostrarlas
  const puede=selA&&selB;
  const Card=({img,sel,onPick,etq})=>(
    <button onClick={onPick} style={{...raised,background:sel?"#e8f0e8":C.winGray,border:sel?"2px solid #2e7d32":undefined,padding:0,cursor:"pointer",overflow:"hidden",display:"flex",flexDirection:"column"}}>
      <div style={{width:"100%",height:90,background:"#000",overflow:"hidden",position:"relative"}}>
        <img src={img.src} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        {sel&&<div style={{position:"absolute",top:3,right:3,background:"#2e7d32",color:"#fff",fontSize:9,fontWeight:"bold",padding:"1px 6px",fontFamily:FONT}}>{etq}</div>}
      </div>
      <div style={{padding:"4px 6px",fontSize:9,color:C.text,fontFamily:FONT,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{img.name}</div>
    </button>
  );
  return(<div style={{background:C.winGray,minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
    {renderHeader("Práctica Libre")}
    <div style={{flex:1,...sunken,margin:8,background:C.winGray,padding:14,overflowY:"auto"}}>
      <div style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:"#2e7d32",marginBottom:8}}>🎯 PRÁCTICA LIBRE</div>
      <div style={{...sunken,background:"#eef6ee",padding:"8px 12px",marginBottom:14,fontSize:11,color:"#2e7d32",lineHeight:1.6}}>
        Elija <b>dos huellas</b> para comparar y marque las minucias a su ritmo, sin fases obligatorias ni entrega. Ideal para soltar la mano antes del cotejo formal.
      </div>

      {/* Prácticas libres en curso */}
      {enProgresoLibres.length>0&&<div style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:"bold",color:C.textGray,marginBottom:6}}>▐ CONTINUAR PRÁCTICA</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {enProgresoLibres.map(c=>{const iA=images[c.imgA],iB=images[c.imgB];return(
            <button key={c.id} onClick={()=>onAbrir(c.id)} style={{...raised,background:C.winGray,padding:0,display:"flex",alignItems:"stretch",cursor:"pointer",textAlign:"left",overflow:"hidden"}}>
              <div style={{display:"flex",flexShrink:0}}>{[iA,iB].map((img,i)=>(<div key={i} style={{width:42,height:42,background:"#eee",overflow:"hidden",borderRight:`1px solid ${C.border}`}}>{img&&<img src={img.src} style={{width:"100%",height:"100%",objectFit:"cover"}}/>}</div>))}</div>
              <div style={{flex:1,padding:"5px 10px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
                <span style={{fontWeight:"bold",fontSize:11,color:"#2e7d32"}}>{c.name}</span>
                <span style={{fontSize:9,color:C.textLight}}>Iniciada {c.takenAt}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",padding:"0 12px",color:"#2e7d32",fontWeight:"bold",fontSize:11}}>▶ Continuar</div>
            </button>
          );})}
        </div>
      </div>}

      {galeria.length<2
        ? <div style={{...sunken,background:C.white,padding:24,textAlign:"center",fontSize:11,color:C.textLight}}>Se necesitan al menos 2 huellas en la galería para practicar.</div>
        : <>
          <div style={{fontSize:11,fontWeight:"bold",color:C.textGray,marginBottom:6}}>▐ ELIJA LAS DOS HUELLAS</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
            {galeria.map(img=>{
              const esA=selA===img.id, esB=selB===img.id;
              const onPick=()=>{ if(esA){setSelA(null);return;} if(esB){setSelB(null);return;} if(!selA){setSelA(img.id);} else if(!selB){setSelB(img.id);} else {setSelB(img.id);} };
              return <Card key={img.id} img={img} sel={esA||esB} onPick={onPick} etq={esA?"A":"B"}/>;
            })}
          </div>
        </>}

      {/* Barra de inicio */}
      <div style={{position:"sticky",bottom:0,marginTop:16,...raised,background:C.winGray,padding:"10px 14px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <span style={{fontSize:10,color:C.textGray}}>
          {selA&&selB?"✓ Huella A y Huella B seleccionadas":selA?"Elija la segunda huella (B)":"Elija la primera huella (A)"}
        </span>
        <button disabled={!puede} onClick={()=>onIniciar(selA,selB,"Práctica libre")} style={{...winBtn(),marginLeft:"auto",fontWeight:"bold",fontSize:12,padding:"6px 20px",color:puede?"#2e7d32":C.textLight,cursor:puede?"pointer":"not-allowed",opacity:puede?1:0.5}}>
          🎯 Iniciar práctica ▶
        </button>
      </div>
    </div>
    {renderFooter()}
  </div>);
}

// ── ESTUDIANTE PANEL ──────────────────────────────────────────────
function EstudiantePanel({onLogout,studentData}){
  const MY_ID=studentData?.cedula||"estudiante1";
  const MY_NAME=studentData?`${studentData.nombre} ${studentData.apellido}`:"Estudiante";
  const [store,setStore]=useState(()=>loadStore());
  const [view,setView]=useState("dashboard");
  const [cotejoId,setCotejoId]=useState(null);
  const [confirmEntregar,setConfirmEntregar]=useState(null);
  const [siguienteTras,setSiguienteTras]=useState(null); // {nombre} del cotejo recién entregado → abre modal "¿qué sigue?"
  const [verificandoId,setVerificandoId]=useState(null); // id del cotejo en verificación
  const [msg,setMsg]=useState("");
  const accent="#aa6600";

  useEffect(()=>{setStore(loadStore());},[]);

  const cotejos=store.cotejos||{},images=store.images||{};
  const persist=(u)=>{setStore(u);saveStore(u);};

  const allCotejos=Object.values(cotejos);
  const myCotejos=allCotejos.filter(c=>c.owner==="estudiante"&&c.studentId===MY_ID);
  const myParentIds=new Set(myCotejos.map(c=>c.parentId));
  const disponibles=allCotejos.filter(c=>c.owner==="docente"&&c.published&&!c.esGuia&&!myParentIds.has(c.id)).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const enProgreso=myCotejos.filter(c=>c.status==="en_progreso"&&!c.modoLibre).sort((a,b)=>(b.takenAt||"").localeCompare(a.takenAt||""));
  const completados=myCotejos.filter(c=>c.status==="entregado"||c.status==="calificado").sort((a,b)=>(b.submittedAt||"").localeCompare(a.submittedAt||""));

  // PRÁCTICA LIBRE: crea un cotejo sin flujo ACE-V estricto a partir de dos
  // imágenes elegidas de la galería. Pensado para que el estudiante practique solo.
  const iniciarPracticaLibre=(imgAId,imgBId,nombre)=>{
    const id=genId();
    const newC={id,name:nombre||"Práctica libre",imgA:imgAId,imgB:imgBId,date:now(),leftShapes:[],rightShapes:[],maxLabel:1,currentLabel:1,noteCaso:"",notePerito:"",noteFecha:"",noteObs:"",pointNames:Array(10).fill(""),owner:"estudiante",status:"en_progreso",studentId:MY_ID,takenAt:now(),modoLibre:true};
    persist({...store,cotejos:{...store.cotejos,[id]:newC}});
    logEvent("cotejo","practica_libre",`${MY_NAME} inició una práctica libre`,MY_ID);
    setCotejoId(id);
  };
  const tomarCotejo=(parent)=>{
    const id=genId();
    const newC={id,name:parent.name,imgA:parent.imgA,imgB:parent.imgB,date:now(),leftShapes:[],rightShapes:[],maxLabel:1,currentLabel:1,noteCaso:"",notePerito:"",noteFecha:"",noteObs:"",pointNames:Array(10).fill(""),owner:"estudiante",status:"en_progreso",parentId:parent.id,studentId:MY_ID,takenAt:now()};
    persist({...store,cotejos:{...store.cotejos,[id]:newC}});
    logEvent("cotejo","tomar",`${MY_NAME} tomó el cotejo "${parent.name}"`,MY_ID);
    setMsg(`✓ Cotejo "${parent.name}" tomado`);
    setTimeout(()=>setMsg(""),2500);
    setCotejoId(id);
  };
  const entregarCotejo=(id)=>{
    const c=cotejos[id];
    const pares=[...new Set([...(c.leftShapes||[]),...(c.rightShapes||[])].map(s=>s.label).filter(Boolean))].filter(l=>(c.leftShapes||[]).some(s=>s.label===l)&&(c.rightShapes||[]).some(s=>s.label===l)).length;
    if(pares===0){setMsg("⚠ Debe marcar al menos 1 punto característico en ambas muestras antes de entregar.");setTimeout(()=>setMsg(""),4000);setConfirmEntregar(null);return;}
    // Verificar plazo desde el cotejo modelo (parent)
    const parent=c.parentId?cotejos[c.parentId]:null;
    const deadline=parent?.deadline||null;
    const strict=!!parent?.deadlineStrict;
    let isLate=false;
    if(deadline){
      const now0=new Date();
      const dl=new Date(deadline+"T23:59:59");
      if(now0>dl){
        if(strict){
          setMsg("🔒 Plazo vencido. El docente configuró este cotejo como ESTRICTO. No se puede entregar.");
          setTimeout(()=>setMsg(""),5000);setConfirmEntregar(null);return;
        }
        isLate=true;
      }
    }
    const u={...store,cotejos:{...store.cotejos,[id]:{...c,status:"entregado",submittedAt:now(),lateSubmission:isLate}}};
    persist(u);
    logEvent("cotejo","entregar",`${MY_NAME} entregó el cotejo "${c.name}" con ${pares} par${pares===1?"":"es"} marcados${isLate?" (TARDÍA)":""}`,MY_ID);
    setConfirmEntregar(null);
    setCotejoId(null); // cerrar el editor si estaba abierto
    setMsg(isLate?"⚠ Cotejo entregado (entrega tardía)":"✓ Cotejo entregado correctamente");
    setTimeout(()=>setMsg(""),3000);
    // 4.1 — Flujo de práctica deliberada: ofrecer el siguiente cotejo sin volver al dashboard.
    setSiguienteTras({nombre:c.name});
  };

  // ── Helpers de plazo ──────────────────────────────────────────
  // Devuelve null (sin plazo) o {date, daysLeft, hoursLeft, totalMs, vencido, strict, urgent, label}
  const deadlineInfo=(cot)=>{
    // Si el cotejo viene del estudiante (copia), mira al parent
    const target=cot.owner==="docente"?cot:(cot.parentId?cotejos[cot.parentId]:null);
    if(!target?.deadline) return null;
    const dl=new Date(target.deadline+"T23:59:59");
    const now0=new Date();
    const diffMs=dl-now0;
    const daysLeft=Math.floor(diffMs/(1000*60*60*24));
    const hoursLeft=Math.floor(diffMs/(1000*60*60));
    const vencido=diffMs<0;
    const urgent=!vencido&&hoursLeft<24;
    let label;
    if(vencido){
      const diasV=Math.floor(-diffMs/(1000*60*60*24));
      label=diasV===0?"VENCIDO HOY":`VENCIDO HACE ${diasV} D`;
    } else if(daysLeft===0){
      label=hoursLeft<=0?"VENCE HOY":`QUEDAN ${hoursLeft}H`;
    } else {
      label=`${daysLeft} D RESTANTES`;
    }
    return {date:target.deadline,daysLeft,hoursLeft,vencido,strict:!!target.deadlineStrict,urgent,label,raw:target};
  };

  // ─── VISTA: VERIFICACIÓN (V de ACE-V) ───
  if(verificandoId){
    const cotejoEst=cotejos[verificandoId];
    const cotejoDoc=cotejoEst?.parentId?cotejos[cotejoEst.parentId]:null;
    if(!cotejoEst||!cotejoDoc){
      setVerificandoId(null);
      return null;
    }
    return <VerificacionScreen
      cotejoEst={cotejoEst}
      cotejoDoc={cotejoDoc}
      images={images}
      onClose={()=>setVerificandoId(null)}
    />;
  }

  if(cotejoId) return <CompareScreen cotejoId={cotejoId} onBack={()=>{setStore(loadStore());setCotejoId(null);}} onLogout={onLogout}/>;

  const pairsOf=(c)=>[...new Set([...(c.leftShapes||[]),...(c.rightShapes||[])].map(s=>s.label).filter(Boolean))].filter(l=>(c.leftShapes||[]).some(s=>s.label===l)&&(c.rightShapes||[]).some(s=>s.label===l)).length;

  const renderHeader=(subtitle)=>(<>
    <div style={{...titleBarStyle,fontSize:14,padding:"4px 12px",borderBottom:`2px solid ${C.borderD}`}}>
      <FpLogo size={30} stroke="#fff"/><span style={{marginLeft:6}}>SIMUSID</span>
      <span style={{fontWeight:"normal",fontSize:10,letterSpacing:2}}>— PANEL ESTUDIANTE{subtitle?` · ${subtitle}`:""}</span>
      <span style={{marginLeft:"auto",fontSize:10,color:"#cce"}}>v1.0</span>
    </div>
    <div style={{background:C.winGray,borderBottom:`1px solid ${C.border}`,padding:"2px 8px",display:"flex",gap:4,alignItems:"center"}}>
      <span style={{fontSize:10,color:accent,fontWeight:"bold"}}>👤 {MY_NAME}</span>
      {view!=="dashboard"&&<button onClick={()=>setView("dashboard")} style={{...winBtn(),fontSize:10,padding:"1px 8px",marginLeft:10}}>◀ Volver al Panel</button>}
      {msg&&<span style={{marginLeft:10,fontSize:10,color:accent,fontWeight:"bold"}}>{msg}</span>}
      <button onClick={onLogout} style={{...winBtn(),marginLeft:"auto",fontSize:10,padding:"1px 10px",color:C.red,fontWeight:"bold"}}>🚪 Cerrar sesión</button>
    </div>
  </>);

  const renderFooter=()=>(
    <div style={{background:C.winGray2,borderTop:`1px solid ${C.border}`,padding:"2px 12px",display:"flex"}}>
      <span style={{fontFamily:FONT,fontSize:10,color:C.textLight}}>SIMUSID v1.0 — Panel Estudiante</span>
      <span style={{marginLeft:"auto",fontFamily:FONT,fontSize:10,color:C.textLight}}>ENTORNO ACADÉMICO DE PRÁCTICA</span>
      <LiveClock/>
    </div>
  );

  if(view==="material") return <MaterialEstudio renderHeader={renderHeader} renderFooter={renderFooter} accent={accent}/>;

  const renderConfirmEntregar=()=>confirmEntregar?(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{...raised,background:C.winGray,padding:0,width:340}}>
      <div style={{...titleBarStyle,fontSize:11}}>📤 Confirmar entrega</div>
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
        <span style={{fontSize:11,lineHeight:1.5}}>Una vez entregado, el cotejo pasará a <b>Completados</b> y quedará registrado para revisión del docente.</span>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={()=>setConfirmEntregar(null)} style={winBtn()}>Cancelar</button>
          <button onClick={()=>entregarCotejo(confirmEntregar)} style={{...winBtn(),color:accent,fontWeight:"bold"}}>✓ Entregar</button>
        </div>
      </div>
    </div>
  </div>):null;

  // 4.1 — Modal "¿Qué sigue?" tras entregar: elegir el siguiente cotejo disponible sin volver al dashboard.
  const renderSiguiente=()=>siguienteTras?(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{...raised,background:C.winGray,padding:0,width:440,maxWidth:"100%",maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
      <div style={{...titleBarStyle,fontSize:11}}>✓ Cotejo entregado — ¿Qué sigue?</div>
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:10,overflow:"auto"}}>
        <span style={{fontSize:11,lineHeight:1.5,color:C.text}}>
          Entregó <b>"{siguienteTras.nombre}"</b>. Puede tomar otro cotejo y seguir practicando sin volver al inicio.
        </span>
        {disponibles.length===0
          ? <div style={{...sunken,background:C.white,padding:"12px 14px",fontSize:11,color:C.textLight,textAlign:"center"}}>
              No hay más cotejos disponibles por ahora. ¡Buen trabajo!
            </div>
          : <>
              <div style={{fontSize:10,fontWeight:"bold",color:C.textGray,letterSpacing:0.5}}>COTEJOS DISPONIBLES ({disponibles.length})</div>
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:300,overflow:"auto"}}>
                {disponibles.map(c=>{
                  const iA=images[c.imgA],iB=images[c.imgB];
                  return(
                    <button key={c.id} onClick={()=>{ setSiguienteTras(null); tomarCotejo(c); }} style={{...raised,background:C.winGray,padding:0,display:"flex",alignItems:"stretch",cursor:"pointer",textAlign:"left",overflow:"hidden"}}>
                      <div style={{display:"flex",flexShrink:0}}>{[iA,iB].map((img,i)=>(<div key={i} style={{width:46,height:46,background:"#eee",overflow:"hidden",borderRight:`1px solid ${C.border}`}}>{img&&<img src={img.src} style={{width:"100%",height:"100%",objectFit:"cover"}}/>}</div>))}</div>
                      <div style={{flex:1,padding:"5px 10px",display:"flex",flexDirection:"column",justifyContent:"center",minWidth:0}}>
                        <span style={{fontWeight:"bold",fontSize:11,color:accent,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</span>
                        <span style={{fontSize:9,color:C.textLight}}>Publicado por docente</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",padding:"0 12px",color:accent,fontWeight:"bold",fontSize:11,flexShrink:0}}>▶ Tomar</div>
                    </button>
                  );
                })}
              </div>
            </>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:2}}>
          <button onClick={()=>{ setSiguienteTras(null); setView("completados"); }} style={winBtn()}>Ver entregados</button>
          <button onClick={()=>{ setSiguienteTras(null); setView("dashboard"); }} style={{...winBtn(),fontWeight:"bold"}}>Ir al inicio</button>
        </div>
      </div>
    </div>
  </div>):null;

  // Lista reusable de cotejos (variantes por vista)
  const renderCotejoRow=(c,actions)=>{const iA=images[c.imgA],iB=images[c.imgB];const dl=deadlineInfo(c);const blocked=dl&&dl.vencido&&dl.strict&&c.status!=="entregado"&&c.status!=="calificado";return(
    <div key={c.id} style={{...raised,display:"flex",alignItems:"stretch",background:blocked?"#f5e0e0":C.winGray,opacity:blocked?0.85:1,borderLeft:dl?(dl.vencido?"4px solid #aa0000":dl.urgent?"4px solid #cc8800":"4px solid #006400"):undefined}}>
      <div style={{display:"flex",flexShrink:0}}>{[iA,iB].map((img,i)=>(<div key={i} style={{width:72,height:72,background:"#eee",overflow:"hidden",borderRight:`1px solid ${C.border}`,flexShrink:0}}>{img&&<img src={img.src} style={{width:"100%",height:"100%",objectFit:"cover"}}/>}</div>))}</div>
      <div style={{flex:1,padding:"6px 12px",display:"flex",flexDirection:"column",justifyContent:"center",gap:2,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontWeight:"bold",fontSize:12,color:accent}}>{c.name}</span>
          {dl&&<span style={{fontSize:8,fontWeight:"bold",letterSpacing:0.5,padding:"1px 6px",color:"#fff",
            background:dl.vencido?"#aa0000":dl.urgent?"#cc8800":"#006400"}}>
            {dl.strict?"🔒 ":"⏰ "}{dl.label}
          </span>}
          {c.lateSubmission&&<span style={{fontSize:8,fontWeight:"bold",letterSpacing:0.5,padding:"1px 6px",color:"#fff",background:"#aa6600"}}>⚠ TARDÍA</span>}
        </div>
        <span style={{fontSize:10,color:C.textGray}}>A: {iA?.name||"?"} | B: {iB?.name||"?"}</span>
        <span style={{fontSize:9,color:C.textLight}}>{c.takenAt?`Tomado: ${c.takenAt}`:c.date}{c.submittedAt?` · Entregado: ${c.submittedAt}`:""}{dl?` · 📅 Plazo: ${dl.date}`:""}</span>
        {c.status==="calificado"&&<span style={{fontSize:10,color:accent,fontWeight:"bold"}}>📝 Nota: {c.grade}/100{c.feedback?` — ${c.feedback.length>40?c.feedback.slice(0,40)+"…":c.feedback}`:""}</span>}
        {blocked&&<span style={{fontSize:9,color:C.red,fontWeight:"bold"}}>🔒 Plazo vencido — modo ESTRICTO: ya no se puede entregar</span>}
      </div>
      <div style={{padding:"6px 12px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderLeft:`1px solid ${C.border}`,gap:2,flexShrink:0}}>
        <span style={{fontSize:9,color:C.textLight}}>PARES</span>
        <span style={{fontWeight:"bold",fontSize:18,color:accent}}>{pairsOf(c)}</span>
      </div>
      <div style={{padding:"6px 10px",display:"flex",flexDirection:"column",justifyContent:"center",gap:4,borderLeft:`1px solid ${C.border}`,flexShrink:0,minWidth:130}}>
        {actions}
      </div>
    </div>
  );};

  // Banner grande con el plazo más urgente del estudiante (vista actual)
  const urgentBanner=(cotejosList)=>{
    const items=cotejosList.map(c=>({c,dl:deadlineInfo(c)})).filter(x=>x.dl);
    if(items.length===0) return null;
    // Ordenar: vencidos primero, luego por menos tiempo restante
    items.sort((a,b)=>{
      if(a.dl.vencido!==b.dl.vencido) return a.dl.vencido?-1:1;
      return a.dl.hoursLeft-b.dl.hoursLeft;
    });
    const top=items[0];
    const danger=top.dl.vencido;
    const warn=!danger&&top.dl.urgent;
    return(<div style={{...raised,background:danger?"#7a0000":warn?"#aa6600":"#006400",color:"#fff",padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:14}}>
      <div style={{fontSize:32}}>{danger?"🔒":warn?"⏰":"📅"}</div>
      <div style={{flex:1,lineHeight:1.4}}>
        <div style={{fontSize:9,letterSpacing:1.5,opacity:0.85,fontWeight:"bold"}}>{danger?"PLAZO VENCIDO":warn?"PLAZO URGENTE":"PRÓXIMO VENCIMIENTO"}</div>
        <div style={{fontSize:16,fontWeight:"bold"}}>{top.c.name}</div>
        <div style={{fontSize:11,opacity:0.95}}>
          {danger?`Plazo vencido el ${top.dl.date}${top.dl.strict?" — modo ESTRICTO":" — entrega tardía permitida"}`
            :`Fecha límite: ${top.dl.date} · ${top.dl.label}${top.dl.strict?" · 🔒 ESTRICTO":" · ⏰ Permisivo"}`}
        </div>
      </div>
      <div style={{fontSize:28,fontWeight:"bold",fontFamily:FONT,textAlign:"right",lineHeight:1}}>
        {top.dl.label.split(" ")[0]}
        <div style={{fontSize:9,opacity:0.85,fontWeight:"normal",letterSpacing:1}}>{top.dl.label.split(" ").slice(1).join(" ")}</div>
      </div>
      {items.length>1&&<div style={{...sunken,background:"rgba(0,0,0,0.2)",padding:"4px 10px",fontSize:10,textAlign:"center"}}>
        <div style={{opacity:0.85,letterSpacing:1}}>+{items.length-1}</div>
        <div style={{fontSize:8,opacity:0.7,letterSpacing:0.5}}>MÁS</div>
      </div>}
    </div>);
  };

  // ─── VISTA: DISPONIBLES ───
  if(view==="libre") return <PracticaLibreView images={images} renderHeader={renderHeader} renderFooter={renderFooter} onIniciar={iniciarPracticaLibre} enProgresoLibres={myCotejos.filter(c=>c.modoLibre&&c.status==="en_progreso")} onAbrir={setCotejoId}/>;

  if(view==="disponibles") return(
    <div style={{background:C.winGray,minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
      {renderHeader("Cotejos Disponibles")}
      <div style={{flex:1,...sunken,margin:8,background:C.winGray,padding:12,overflowY:"auto"}}>
        <div style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:accent,marginBottom:10}}>▐ COTEJOS DISPONIBLES</div>
        {urgentBanner(disponibles)}
        <div style={{...sunken,background:C.white,padding:"6px 10px",marginBottom:10,fontSize:10}}>ℹ Cotejos publicados por los docentes. Al tomarlos, se crea su propia copia en <b>En progreso</b>.</div>
        {disponibles.length===0&&<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:11}}>No hay cotejos disponibles en este momento. Vuelva a consultar más tarde.</div>}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {disponibles.map(c=>{const dl=deadlineInfo(c);const locked=dl&&dl.vencido&&dl.strict;
            return renderCotejoRow(c,
              locked?<span style={{fontSize:9,color:C.red,fontWeight:"bold",textAlign:"center"}}>🔒 Plazo<br/>vencido</span>
                    :<button onClick={()=>tomarCotejo(c)} style={{...winBtn(),fontWeight:"bold",color:accent}}>▶ Tomar Cotejo</button>
            );
          })}
        </div>
      </div>
      {renderFooter()}
    </div>
  );

  // ─── VISTA: EN PROGRESO ───
  if(view==="progreso") return(
    <div style={{background:C.winGray,minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
      {renderHeader("Cotejos en Progreso")}
      <div style={{flex:1,...sunken,margin:8,background:C.winGray,padding:12,overflowY:"auto"}}>
        <div style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:accent,marginBottom:10}}>▐ EN PROGRESO</div>
        {urgentBanner(enProgreso)}
        <div style={{...sunken,background:C.white,padding:"6px 10px",marginBottom:10,fontSize:10}}>ℹ Sus cotejos en curso. Marque los puntos característicos y, cuando termine, presione <b>📤 Entregar</b>.</div>
        {enProgreso.length===0&&<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:11}}>No tiene cotejos en progreso. Vaya a <b>Disponibles</b> para tomar uno.</div>}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {enProgreso.map(c=>{
            const p=pairsOf(c);
            const dl=deadlineInfo(c);
            const locked=dl&&dl.vencido&&dl.strict;
            // ── Verificar si todas las notas están completas ──
            const notasCompletas=true; // las notas fueron eliminadas del flujo
            const puedeEntregar=p>0&&!locked&&notasCompletas;
            return renderCotejoRow(c,<>
              {p===0&&!locked&&<span style={{fontSize:9,color:C.red,textAlign:"center",fontFamily:FONT}}>⚠ Sin puntos<br/>marcados</span>}
              <button onClick={()=>setCotejoId(c.id)} style={winBtn()}>▶ Continuar</button>
              <button onClick={()=>setConfirmEntregar(c.id)} disabled={!puedeEntregar} title={locked?"Plazo vencido en modo ESTRICTO":(p===0?"Marque al menos 1 par de puntos en ambas muestras":"")} style={{...winBtn(),fontWeight:"bold",color:!puedeEntregar?C.textLight:accent,cursor:!puedeEntregar?"not-allowed":"pointer",opacity:!puedeEntregar?0.6:1}}>{locked?"🔒 Bloqueado":"📤 Entregar"}</button>
            </>);
          })}
        </div>
      </div>
      {renderConfirmEntregar()}
      {renderSiguiente()}
      {renderFooter()}
    </div>
  );

  // ─── VISTA: COMPLETADOS ───
  if(view==="completados") return(
    <div style={{background:C.winGray,minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
      {renderHeader("Cotejos Completados")}
      <div style={{flex:1,...sunken,margin:8,background:C.winGray,padding:12,overflowY:"auto"}}>
        <div style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:accent,marginBottom:10}}>▐ COMPLETADOS</div>
        <div style={{...sunken,background:C.white,padding:"6px 10px",marginBottom:10,fontSize:10}}>ℹ Cotejos entregados al docente. Puede consultarlos, descargar el <b>acta de práctica en PDF</b> o realizar la <b>⚖ Verificación (V)</b> comparando su trabajo con el del docente.</div>
        {completados.length===0&&<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:11}}>Aún no ha entregado ningún cotejo.</div>}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {completados.map(c=>{
            const modelo=c.parentId?cotejos[c.parentId]:null;
            const tieneModelo=!!modelo;
            return renderCotejoRow(c,<>
              <button onClick={()=>setCotejoId(c.id)} style={winBtn()}>👁 Ver</button>
              <button
                onClick={()=>setVerificandoId(c.id)}
                disabled={!tieneModelo}
                title={tieneModelo?"Comparar su trabajo con el del docente (verificador)":"El cotejo modelo del docente ya no está disponible"}
                style={{...winBtn(),fontWeight:"bold",color:tieneModelo?"#7a4400":C.textLight,opacity:tieneModelo?1:0.5,cursor:tieneModelo?"pointer":"not-allowed"}}>
                ⚖ Verificación
              </button>
              <button onClick={async()=>{
                try{
                  setMsg("⏳ Generando PDF...");
                  await exportCotejoPDF(c, store, studentData);
                  setMsg("✓ PDF descargado");
                }catch(err){
                  setMsg("⚠ Error: "+err.message);
                }
                setTimeout(()=>setMsg(""),3000);
              }} style={{...winBtn(),color:"#7a0000",fontWeight:"bold"}}>📄 PDF</button>
            </>);
          })}
        </div>
      </div>
      {renderFooter()}
    </div>
  );

  // ─── DASHBOARD ───
  const cards=[
    {icon:"🎯",t:"Práctica Libre",sub:"Marque minucias a su ritmo",n:"▶",view:"libre"},
    {icon:"📋",t:"Cotejos Disponibles",sub:"Publicados por docentes",n:disponibles.length,view:"disponibles"},
    {icon:"✏",t:"En Progreso",sub:"Sus cotejos en curso",n:enProgreso.length,view:"progreso"},
    {icon:"✓",t:"Completados",sub:"Cotejos entregados",n:completados.length,view:"completados"},
    {icon:"📚",t:"Material de Estudio",sub:"Glosario y tipos de huella",n:"📖",view:"material"},
  ];
  return(
    <div style={{background:C.winGray,minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
      {renderHeader()}
      <div style={{flex:1,...sunken,margin:8,background:C.winGray,padding:16,overflowY:"auto"}}>
        <div style={{marginBottom:16,paddingBottom:10,borderBottom:`1px solid ${C.border}`}}>
          <div style={{...raised,background:C.white,padding:"10px 14px",display:"flex",alignItems:"center",gap:12}}>
            <FpLogo size={40} stroke={accent}/>
            <div>
              <div style={{fontSize:14,fontWeight:"bold",color:accent,letterSpacing:1}}>BIENVENIDO — {MY_NAME.toUpperCase()}</div>
              <div style={{fontSize:10,color:C.blue,marginTop:1}}>C.C.: {MY_ID}</div>
              <div style={{fontSize:10,color:C.textGray,marginTop:2}}>Panel de prácticas dactiloscópicas</div>
            </div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10,marginBottom:16}}>
          {cards.map((c,i)=>(
            <button key={i} onClick={()=>c.action?c.action():setView(c.view)} style={{...raised,background:C.winGray,padding:"14px 16px",display:"flex",flexDirection:"column",gap:6,cursor:"pointer",fontFamily:FONT,textAlign:"left",alignItems:"stretch"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:28}}>{c.icon}</span>
                <span style={{fontSize:24,fontWeight:"bold",color:accent,fontFamily:FONT}}>{c.n}</span>
              </div>
              <div style={{fontSize:11,color:C.text,fontWeight:"bold"}}>{c.t}</div>
              <div style={{fontSize:9,color:C.textLight}}>{c.sub}</div>
              <div style={{fontSize:9,color:accent,marginTop:2}}>▶ Abrir →</div>
            </button>
          ))}
        </div>
        <div style={{...sunken,background:C.white,padding:"12px 16px",fontSize:11,color:C.textGray,lineHeight:1.7}}>
          <div style={{fontSize:11,fontWeight:"bold",color:accent,marginBottom:4}}>▐ FLUJO DE TRABAJO</div>
          <b style={{color:C.text}}>1.</b> Entre a <b>Disponibles</b> y tome un cotejo publicado por el docente. &nbsp;
          <b style={{color:C.text}}>2.</b> Trabájelo en <b>En Progreso</b>: marque los puntos característicos en ambas muestras. &nbsp;
          <b style={{color:C.text}}>3.</b> Cuando esté listo, presione <b>📤 Entregar</b> y pasará a <b>Completados</b>.
        </div>
      </div>
      {renderFooter()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ── SECCIÓN: GRÁFICO DE SUFICIENCIA (material de estudio) ─────────
// Selector de calidad (Tabla 1) + recuento de minucias que alimenta el
// gráfico interactivo. Aquí es donde el estudiante explora la idoneidad.
function SeccionSuficiencia({accent}){
  const [calidad,setCalidad]=useState("");
  const [recuento,setRecuento]=useState("");
  const calOpts=[
    {v:"alta",l:"Alta",d:"Nivel 1 distintivo; Nivel 2 distintivo; abundante Nivel 3."},
    {v:"media_alta",l:"Media-alta",d:"Nivel 1 distintivo; mayoría de Nivel 2 distintivo; mínimo Nivel 3."},
    {v:"media_baja",l:"Media-baja",d:"Nivel 1 distintivo; pocos detalles de Nivel 2 distintivos; sin Nivel 3."},
    {v:"baja",l:"Baja",d:"Nivel 1 NO distintivo; mayoría de Nivel 2 indistintivos; sin Nivel 3."},
  ];
  const recOpts=[["pocos","Pocos (<4)"],["medios","Medios (5–9)"],["muchos","Muchos (>10)"]];
  return(<>
    <div style={{...sunken,background:"#fffff0",padding:"10px 14px",marginBottom:10,fontSize:11,lineHeight:1.6,color:"#7a4400"}}>
      El <b>Gráfico de Suficiencia</b> (SWGFAST #10, Fig. 1) cruza la <b>calidad</b> de la impresión con la <b>cantidad de minucias</b> observadas y muestra en qué zona cae la decisión: <b>A</b> insuficiente, <b>B</b> compleja, <b>C</b> no compleja. Es una guía para razonar la idoneidad — <b>no</b> una fórmula numérica.
    </div>

    {/* Selector de calidad (Tabla 1) */}
    <div style={{...raised,background:C.winGray,padding:"8px 10px",marginBottom:10}}>
      <div style={{fontSize:11,fontWeight:"bold",color:C.blue,marginBottom:6}}>CALIDAD (Tabla 1)</div>
      <div style={{display:"flex",flexDirection:"column",gap:3}}>
        {calOpts.map(opt=>{
          const sel=calidad===opt.v;
          return(
            <button key={opt.v} type="button" onClick={()=>setCalidad(sel?"":opt.v)} style={{...raised,background:sel?C.winGray3:C.winGray,border:sel?`2px solid ${C.blue}`:undefined,padding:"5px 8px",cursor:"pointer",textAlign:"left",fontFamily:FONT,display:"flex",gap:8,alignItems:"baseline"}}>
              <span style={{fontSize:10,fontWeight:"bold",color:sel?C.blue:C.text,width:74,flexShrink:0}}>{opt.l}</span>
              <span style={{fontSize:9,color:C.textGray,lineHeight:1.4}}>{opt.d}</span>
            </button>
          );
        })}
      </div>
    </div>

    {/* Selector de recuento de minucias */}
    <div style={{...raised,background:C.winGray,padding:"8px 10px",marginBottom:10}}>
      <div style={{fontSize:11,fontWeight:"bold",color:C.blue,marginBottom:6}}>CANTIDAD DE MINUCIAS (Nivel 2)</div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        {recOpts.map(([v,l])=>{
          const sel=recuento===v;
          return(
            <button key={v} type="button" onClick={()=>setRecuento(sel?"":v)} style={{...raised,background:sel?C.winGray3:C.winGray,border:sel?`2px solid ${C.blue}`:undefined,fontFamily:FONT,fontSize:10,padding:"4px 10px",cursor:"pointer",fontWeight:sel?"bold":"normal",color:sel?C.blue:C.text}}>{l}</button>
          );
        })}
      </div>
    </div>

    {/* Gráfico */}
    <GraficoSuficiencia calidad={calidad} recuento={recuento}/>
  </>);
}

// ── MATERIAL DE ESTUDIO (Estudiante) ──────────────────────────────
// ═══════════════════════════════════════════════════════════════════
// SVG didáctico de cada minucia. Cada dibujo muestra la minucia en su contexto
// (crestas paralelas vecinas) para que se entienda visualmente.
// Las crestas se dibujan como líneas horizontales; el rojo destaca la minucia.
function MinuciaSVG({id, color="#cc0000", size=48}){
  const W=64, H=48;
  const stroke = "#444"; // crestas vecinas
  const high = color;    // minucia destacada
  const sw = 2.2;        // grosor crestas
  const swH = 2.6;       // grosor minucia
  return(<svg width={size} height={size*H/W} viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg">
    {id===1 && /* ABRUPTA: cresta que termina bruscamente */ <>
      <line x1="4" y1="10" x2="60" y2="10" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <line x1="4" y1="24" x2="34" y2="24" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <circle cx="34" cy="24" r="2.5" fill={high}/>
      <line x1="4" y1="38" x2="60" y2="38" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
    </>}
    {id===2 && /* BIFURCACIÓN: una cresta se divide en dos */ <>
      <line x1="4" y1="10" x2="60" y2="10" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <path d="M 4 24 L 30 24 L 50 17" fill="none" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <path d="M 30 24 L 50 31" fill="none" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <line x1="4" y1="38" x2="60" y2="38" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
    </>}
    {id===3 && /* CONVERGENCIA: dos crestas que se unen en una */ <>
      <line x1="4" y1="10" x2="60" y2="10" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <path d="M 4 17 L 24 24 L 60 24" fill="none" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <path d="M 4 31 L 24 24" fill="none" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <line x1="4" y1="38" x2="60" y2="38" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
    </>}
    {id===4 && /* OJAL: cresta que se abre formando un ojo y se cierra */ <>
      <line x1="4" y1="10" x2="60" y2="10" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <path d="M 4 24 L 22 24 Q 32 18 42 24 L 60 24" fill="none" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <path d="M 22 24 Q 32 30 42 24" fill="none" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <line x1="4" y1="38" x2="60" y2="38" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
    </>}
    {id===5 && /* EMPALME: dos crestas paralelas conectadas por un puente corto */ <>
      <line x1="4" y1="10" x2="60" y2="10" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <line x1="4" y1="20" x2="60" y2="20" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <line x1="26" y1="20" x2="34" y2="28" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <line x1="4" y1="28" x2="60" y2="28" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <line x1="4" y1="38" x2="60" y2="38" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
    </>}
    {id===6 && /* INTERRUPCIÓN: cresta con corte breve y continúa */ <>
      <line x1="4" y1="10" x2="60" y2="10" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <line x1="4" y1="24" x2="28" y2="24" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <line x1="36" y1="24" x2="60" y2="24" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <line x1="4" y1="38" x2="60" y2="38" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
    </>}
    {id===7 && /* DESVIACIÓN: cresta con cambio brusco de dirección */ <>
      <line x1="4" y1="10" x2="60" y2="10" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <path d="M 4 28 L 28 28 L 60 18" fill="none" stroke={high} strokeWidth={swH} strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="4" y1="38" x2="60" y2="38" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
    </>}
    {id===8 && /* TRANSVERSAL: cresta corta cruza perpendicular a las crestas */ <>
      <line x1="4" y1="10" x2="60" y2="10" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <line x1="4" y1="20" x2="60" y2="20" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <line x1="32" y1="14" x2="32" y2="34" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <line x1="4" y1="28" x2="60" y2="28" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <line x1="4" y1="38" x2="60" y2="38" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
    </>}
    {id===9 && /* PUNTO: fragmento puntual aislado entre crestas */ <>
      <line x1="4" y1="10" x2="60" y2="10" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <line x1="4" y1="20" x2="60" y2="20" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <circle cx="32" cy="24" r="3" fill={high}/>
      <line x1="4" y1="28" x2="60" y2="28" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <line x1="4" y1="38" x2="60" y2="38" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
    </>}
    {id===10 && /* FRAGMENTO: trozo corto de cresta aislado entre dos paralelas */ <>
      <line x1="4" y1="10" x2="60" y2="10" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <line x1="4" y1="20" x2="60" y2="20" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <line x1="24" y1="24" x2="42" y2="24" stroke={high} strokeWidth={swH} strokeLinecap="round"/>
      <line x1="4" y1="28" x2="60" y2="28" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      <line x1="4" y1="38" x2="60" y2="38" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
    </>}
  </svg>);
}

const MINUCIAS_INFO=[
  {id:1,n:"Abrupta",desc:"Es la terminación brusca de una cresta papilar. Una cresta que se interrumpe sin continuar. Es una de las minucias más comunes y se identifica por el final claro de la línea.",ex:"Final de un trazo"},
  {id:2,n:"Bifurcación",desc:"Una cresta papilar se divide en dos crestas que continúan por separado. Es la segunda minucia más frecuente y se reconoce por la forma de 'Y' o 'V'.",ex:"Como una rama de árbol"},
  {id:3,n:"Convergencia",desc:"Dos crestas independientes que se unen para formar una sola. Es la imagen inversa de la bifurcación.",ex:"Dos ríos que se juntan"},
  {id:4,n:"Ojal",desc:"Una cresta papilar que se abre formando un espacio cerrado y luego vuelve a unirse. También llamada 'lago' o 'islote cerrado'.",ex:"Forma ovalada cerrada"},
  {id:5,n:"Empalme",desc:"Una cresta corta que une dos crestas paralelas. Forma como un 'puente' entre dos crestas vecinas.",ex:"Puente entre crestas"},
  {id:6,n:"Interrupción",desc:"Una cresta presenta una pequeña discontinuidad, pero continúa con el mismo trayecto. La separación debe ser muy corta para no confundirse con dos abruptas.",ex:"Línea con un corte breve"},
  {id:7,n:"Desviación",desc:"Cambio de dirección brusco de una cresta papilar sin perder su continuidad. Forma un ángulo claro en el trayecto.",ex:"Cresta que cambia de rumbo"},
  {id:8,n:"Transversal",desc:"Cresta corta que cruza perpendicularmente a otras crestas, sin unirse a ellas. Suele ser muy breve.",ex:"Línea atravesada"},
  {id:9,n:"Punto",desc:"Fragmento muy corto de cresta papilar, casi puntual. Aparece como un punto aislado entre las demás crestas.",ex:"Punto entre crestas"},
  {id:10,n:"Fragmento",desc:"Segmento de cresta papilar más largo que un 'punto' pero más corto que una cresta normal. Es independiente y no se conecta a otras crestas.",ex:"Pedazo de cresta aislado"},
];
const TIPOS_HUELLA=[
  {n:"Arco",sigla:"A",icon:"⌒",desc:"Las crestas entran por un lado, suben suavemente formando una elevación y salen por el lado opuesto. No presenta deltas ni núcleo verdaderos. Es el patrón más simple y menos frecuente.",freq:"~5%",deltas:"0 deltas"},
  {n:"Entoldado",sigla:"T",icon:"⋀",desc:"Variante del arco con una o varias crestas que se elevan bruscamente en el centro formando un ángulo agudo o un eje vertical, como una tienda de campaña (tent arch).",freq:"Muy raro",deltas:"0 deltas"},
  {n:"Presilla Radial",sigla:"R",icon:"⊂",desc:"Las crestas entran por un lado, se curvan formando un núcleo y salen por donde entraron, con la abertura orientada hacia el lado del radio (pulgar). El delta queda en el lado opuesto al pulgar.",freq:"~5%",deltas:"1 delta"},
  {n:"Presilla Cubital",sigla:"U",icon:"⊃",desc:"Igual a la presilla radial pero con la abertura orientada hacia el lado del cúbito (meñique). El delta queda hacia el lado del pulgar. Es el patrón más común en la población.",freq:"~60%",deltas:"1 delta"},
  {n:"Verticilo",sigla:"W",icon:"◎",desc:"Las crestas forman un patrón circular, ovalado o espiral cerrado en el centro de la huella. Presenta dos deltas, uno a cada lado del núcleo. Patrón común y muy útil para identificación.",freq:"~25%",deltas:"2 deltas"},
  {n:"Central de Bolsillo",sigla:"C",icon:"⊙",desc:"Variante del verticilo donde una de las crestas forma un pequeño bolsillo (loop) cerrado en el centro del patrón. Considerado un subtipo del verticilo en el sistema canadiense.",freq:"Poco frecuente",deltas:"2 deltas"},
  {n:"Doble Presilla",sigla:"D",icon:"∽",desc:"Patrón formado por dos presillas entrelazadas, una sobre la otra, en sentidos opuestos. Cada presilla aporta su propio núcleo y delta. Es clasificado como tipo de verticilo en Henry Canadiense.",freq:"Poco frecuente",deltas:"2 deltas"},
  {n:"Accidental",sigla:"X",icon:"⊛",desc:"Combinación de dos o más patrones distintos (por ejemplo: presilla + verticilo, o patrones que no encajan en ninguna otra categoría). Tiene dos o más deltas. Patrón raro pero muy distintivo.",freq:"~1%",deltas:"2 o más deltas"},
];
const ACE_V_FASES=[
  {letra:"A",n:"Análisis",color:"#1565c0",d:"El perito examina por separado cada huella (la dubitada y la indubitada) sin compararlas todavía. Evalúa la calidad, la cantidad de información visible y determina si la impresión es apta para el cotejo. Aquí se identifican los detalles de nivel 1, 2 y 3 que pueden ser útiles.",pasos:["Revisar la calidad y nitidez de la huella","Identificar patrón general (arco, presilla, verticilo)","Localizar deltas, núcleos y zonas de interés","Decidir si la huella es idónea para comparación"]},
  {letra:"C",n:"Comparación",color:"#2e7d32",d:"Se examinan ambas huellas en paralelo para identificar similitudes y discrepancias en los detalles observados durante el análisis. La comparación parte del nivel 1 (patrón general) hasta llegar al nivel 3 (poros, formas de crestas).",pasos:["Comparar el patrón general y zona delta-núcleo","Buscar correspondencia de minucias (puntos característicos)","Verificar ubicación, dirección y relación espacial entre minucias","Documentar puntos coincidentes y discrepancias"]},
  {letra:"E",n:"Evaluación",color:"#c62828",d:"El perito toma una decisión basada en los hallazgos de las fases anteriores. Las tres conclusiones posibles son: individualización (misma fuente), exclusión (distinta fuente) o inconcluso (información insuficiente).",pasos:["Pesar la cantidad y calidad de coincidencias","Evaluar si las discrepancias son explicables (distorsión, presión)","Emitir conclusión: identidad, exclusión o inconcluso","Justificar técnicamente la decisión"]},
  {letra:"V",n:"Verificación",color:"#7a4400",d:"Un segundo perito calificado, de forma independiente, repite las fases A-C-E sobre las mismas huellas. Solo si llega a la misma conclusión se valida el resultado original. Esta fase es esencial para minimizar errores y reforzar la fiabilidad pericial.",pasos:["Examen totalmente independiente por otro perito","Aplicación de las mismas tres fases (A-C-E)","Confrontación de conclusiones","Validación o señalamiento de discrepancias"]},
];

const NIVELES_DETALLE=[
  {nivel:"I",titulo:"Nivel I — Patrón General",color:"#1565c0",icon:"🌀",
    desc:"Se refiere al patrón global de las crestas papilares: el flujo, la forma del dactilograma y la presencia de deltas y núcleos. Permite la clasificación pero NO determina identidad por sí solo.",
    ej:"Arco (A), Entoldado (T), Presilla Radial (R), Presilla Cubital (U), Verticilo (W), Central de Bolsillo (C), Doble Presilla (D), Accidental (X)",
    uso:"Es útil para EXCLUIR rápidamente: si los patrones son distintos (un arco vs un verticilo), las huellas no son de la misma fuente. Es INCLUYENTE pero no concluyente.",
    minimo:"No determina identidad personal por sí solo"},
  {nivel:"II",titulo:"Nivel II — Minucias o Puntos Característicos",color:"#2e7d32",icon:"📍",
    desc:"Son los detalles específicos donde las crestas papilares se interrumpen, dividen, unen o forman estructuras particulares. Constituyen el núcleo del cotejo forense tradicional y permiten establecer identidad dactilar.",
    ej:"Abrupta, bifurcación, convergencia, ojal, empalme, interrupción, desviación, transversal, punto, fragmento",
    uso:"La búsqueda y acotación de un número mínimo de minucias coincidentes (en ubicación, dirección y relación) permite ESTABLECER IDENTIDAD entre dos huellas.",
    minimo:"Entre 8 y 12 puntos característicos coincidentes (según el país y la doctrina aplicada)"},
  {nivel:"III",titulo:"Nivel III — Detalles Intrínsecos",color:"#7a4400",icon:"🔬",
    desc:"Estudia los detalles más finos de la cresta papilar: poros sudoríparos, formas y medidas de los bordes de las crestas, surcos interpapilares, líneas alboscópicas e imperfecciones. Es la observación más microscópica y determina ORIGINALIDAD.",
    ej:"Poros, formas de los bordes crestales, crestas incipientes, líneas blancas, cicatrices, surcos interpapilares",
    uso:"Complementa al nivel II. Determina si la huella es de origen humano (no artificial) y refuerza la identidad cuando el nivel II es insuficiente. Requiere muy alta calidad de imagen.",
    minimo:"40 poros mínimo dentro de 3 minucias"},
];

const TIPS_PRACTICOS=[
  {t:"Trabaje con buena iluminación",d:"Las minucias son detalles diminutos. Use el zoom y los filtros (brillo, contraste, VUCSA) para resaltarlas. La herramienta 🔍 Editar imagen está para eso."},
  {t:"Empiece por las minucias evidentes",d:"Busque primero bifurcaciones y abruptas, son las más fáciles de identificar. Deje los ojales y puntos para el final."},
  {t:"Marque pares simultáneamente",d:"Por cada punto que marque en la muestra A, busque inmediatamente el equivalente en la muestra B usando el mismo número y color. El cotejo se valida por pares, no por puntos sueltos."},
  {t:"Use colores para categorizar",d:"Por ejemplo: azul para bifurcaciones, rojo para abruptas, verde para ojales. Le ayudará a llevar el orden mental."},
  {t:"Active 'Sync zoom'",d:"Cuando hace zoom o se mueve en una muestra, el otro panel hace lo mismo. Útil para comparar regiones simétricas rápidamente."},
  {t:"Guarde con frecuencia (Ctrl+S)",d:"Aunque el sistema autoguarda, mejor confirmar. Ctrl+Z deshace, Ctrl+Y rehace."},
  {t:"Mínimo 8-12 minucias",d:"Aunque la app no lo exige, en la práctica forense se suelen requerir entre 8 y 12 puntos característicos coincidentes para afirmar identidad."},
];

function MaterialEstudio({renderHeader,renderFooter,accent}){
  const [section,setSection]=useState("glosario"); // glosario|tipos|tips|guia
  const [selected,setSelected]=useState(null);
  return(<div style={{background:C.winGray,minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
    {renderHeader("Material de Estudio")}
    <div style={{flex:1,...sunken,margin:8,background:C.winGray,padding:12,overflowY:"auto"}}>
      <div style={{fontFamily:FONT,fontSize:12,fontWeight:"bold",color:accent,marginBottom:10}}>▐ MATERIAL DE ESTUDIO</div>
      <div style={{display:"flex",gap:3,marginBottom:12,flexWrap:"wrap"}}>
        {[
          {k:"glosario",l:"🔍 Glosario de Minucias"},
          {k:"tipos",l:"🌀 Tipos de Huella"},
          {k:"acev",l:"⚖ Método ACE-V"},
          {k:"niveles",l:"📐 Modelo Integrador"},
          {k:"suficiencia",l:"📊 Gráfico de Suficiencia"},
          {k:"tips",l:"💡 Tips Prácticos"},
        ].map(b=>(
          <button key={b.k} onClick={()=>{setSection(b.k);setSelected(null);}} style={{...winBtn(section===b.k),fontSize:11,padding:"5px 14px",fontWeight:section===b.k?"bold":"normal"}}>{b.l}</button>
        ))}
      </div>

      {/* GLOSARIO */}
      {section==="glosario"&&<>
        <div style={{...sunken,background:C.white,padding:"8px 12px",marginBottom:10,fontSize:11,lineHeight:1.6}}>
          Las <b>minucias</b> son los puntos característicos de una huella dactilar que se usan para identificar si dos huellas pertenecen a la misma persona. Clic en cada una para ver el detalle.
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:8,marginBottom:14}}>
          {MINUCIAS_INFO.map(m=>(
            <button key={m.id} onClick={()=>setSelected(selected?.id===m.id?null:m)} style={{
              ...raised,background:selected?.id===m.id?"#fff3d4":C.winGray,padding:"10px 8px",cursor:"pointer",
              textAlign:"left",display:"flex",flexDirection:"column",gap:4,fontFamily:FONT,
              border:selected?.id===m.id?"2px solid "+accent:undefined
            }}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{...sunken,background:"#fff",width:60,height:46,display:"flex",alignItems:"center",justifyContent:"center",padding:2}}><MinuciaSVG id={m.id} color={accent} size={56}/></div>
                <div>
                  <div style={{fontSize:9,color:C.textLight,fontWeight:"bold"}}>#{m.id}</div>
                  <div style={{fontSize:12,fontWeight:"bold",color:accent}}>{m.n}</div>
                </div>
              </div>
              <div style={{fontSize:9,color:C.textGray,fontStyle:"italic"}}>{m.ex}</div>
            </button>
          ))}
        </div>
        {selected&&<div style={{...raised,background:"#fffff0",padding:16}}>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:10}}>
            <div style={{...sunken,background:C.white,width:96,height:72,display:"flex",alignItems:"center",justifyContent:"center",padding:4,flexShrink:0}}><MinuciaSVG id={selected.id} color={accent} size={88}/></div>
            <div style={{flex:1}}>
              <div style={{fontSize:9,color:C.textLight,letterSpacing:1,fontWeight:"bold"}}>MINUCIA #{selected.id}</div>
              <div style={{fontSize:16,fontWeight:"bold",color:accent}}>{selected.n}</div>
            </div>
            <button onClick={()=>setSelected(null)} style={{...winBtn(),fontSize:10}}>✕ Cerrar</button>
          </div>
          <div style={{fontSize:12,lineHeight:1.7,color:C.text}}>{selected.desc}</div>
          <div style={{...sunken,background:C.white,padding:"6px 10px",marginTop:10,fontSize:10,color:"#7a6000"}}>💡 <b>Recuerde:</b> {selected.ex}</div>
        </div>}
      </>}

      {/* TIPOS DE HUELLA */}
      {section==="tipos"&&<>
        <div style={{...sunken,background:C.white,padding:"8px 12px",marginBottom:10,fontSize:11,lineHeight:1.6}}>
          En Colombia se emplea el sistema <b>Henry Canadiense</b>, que clasifica las huellas dactilares en <b>ocho tipos</b> identificados por una letra (A, T, R, U, W, C, D, X). Cada tipo se distingue por el flujo de las crestas, la cantidad de deltas y la presencia o no de núcleo.
        </div>
        <div style={{...sunken,background:"#fffff0",padding:"8px 12px",marginBottom:12,fontSize:10,color:"#7a4400",lineHeight:1.6}}>
          📌 <b>Familias principales:</b> Arcos (A, T) sin deltas · Presillas (R, U) con un delta · Verticilos (W, C, D) con dos deltas · Accidental (X) con dos o más deltas.
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:10}}>
          {TIPOS_HUELLA.map((t,i)=>(
            <div key={i} style={{...raised,background:C.winGray,padding:12}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                <div style={{...sunken,background:"#fff",width:50,height:50,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,color:accent,position:"relative"}}>
                  {t.icon}
                  <div style={{position:"absolute",bottom:-3,right:-3,background:accent,color:"#fff",fontSize:11,fontFamily:FONT,fontWeight:"bold",padding:"0 5px",border:"1px solid #fff"}}>{t.sigla}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:"bold",color:accent}}>{t.n} <span style={{color:C.textGray,fontWeight:"normal"}}>({t.sigla})</span></div>
                  <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
                    <div style={{...sunken,background:"#fffff0",padding:"1px 6px",fontSize:9,color:"#7a6000"}}>📊 {t.freq}</div>
                    <div style={{...sunken,background:"#e8f0e8",padding:"1px 6px",fontSize:9,color:"#006400"}}>△ {t.deltas}</div>
                  </div>
                </div>
              </div>
              <div style={{fontSize:10,color:C.textGray,lineHeight:1.6}}>{t.desc}</div>
            </div>
          ))}
        </div>
      </>}

      {/* TIPS */}
      {/* MÉTODO ACE-V */}
      {section==="acev"&&<>
        <div style={{...sunken,background:"#fffff0",padding:"10px 14px",marginBottom:10,fontSize:11,lineHeight:1.6,color:"#7a4400"}}>
          El <b>Método ACE-V</b> es el protocolo científico de cuatro fases empleado mundialmente en dactiloscopia forense. Adoptado por el <b>FBI</b> desde 1999 y descrito en documentos del <b>SWGFAST</b> (Scientific Working Group on Friction Ridge Analysis, Study and Technology). Garantiza un proceso sistemático, transparente y reproducible.
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:8,marginBottom:14}}>
          {ACE_V_FASES.map((f,i)=>(
            <div key={i} style={{...raised,background:C.winGray,padding:0,overflow:"hidden"}}>
              <div style={{background:f.color,color:"#fff",padding:"6px 10px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{...sunken,background:"#fff",color:f.color,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:"bold"}}>{f.letra}</div>
                <div style={{fontSize:13,fontWeight:"bold",letterSpacing:0.5}}>{f.n}</div>
              </div>
              <div style={{padding:"8px 12px",fontSize:10,color:C.textGray,lineHeight:1.6}}>{f.d}</div>
              <div style={{...sunken,background:C.white,margin:"0 8px 8px",padding:"6px 8px"}}>
                {f.pasos.map((p,k)=>(
                  <div key={k} style={{fontSize:9,color:C.text,padding:"2px 0",display:"flex",gap:6}}>
                    <span style={{color:f.color,fontWeight:"bold",flexShrink:0}}>{k+1}.</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{...sunken,background:"#e8f0e8",padding:"8px 12px",fontSize:10,color:"#006400",lineHeight:1.6}}>
          💡 <b>En SIMUSID:</b> el docente realiza el cotejo modelo (A-C-E). El estudiante hace su propio cotejo y, al entregarlo, puede realizar la fase V usando el botón <b>⚖ Verificación</b> en Cotejos Completados.
        </div>
      </>}

      {/* MODELO INTEGRADOR */}
      {section==="niveles"&&<>
        <div style={{...sunken,background:"#fffff0",padding:"10px 14px",marginBottom:10,fontSize:11,lineHeight:1.6,color:"#7a4400"}}>
          El <b>Modelo Integrador</b> propone un análisis estandarizado en <b>tres niveles de detalle</b> sucesivos, donde cada nivel aporta información cada vez más específica. La combinación de los tres niveles permite establecer la identidad dactilar con rigor científico.
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
          {NIVELES_DETALLE.map((nv,i)=>(
            <div key={i} style={{...raised,background:C.winGray,padding:0,overflow:"hidden",borderLeft:`6px solid ${nv.color}`}}>
              <div style={{padding:"8px 14px",display:"flex",alignItems:"center",gap:12,background:`${nv.color}11`}}>
                <div style={{fontSize:28}}>{nv.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,color:nv.color,fontWeight:"bold",letterSpacing:1}}>NIVEL {nv.nivel}</div>
                  <div style={{fontSize:13,fontWeight:"bold",color:nv.color}}>{nv.titulo}</div>
                </div>
              </div>
              <div style={{padding:"10px 14px"}}>
                <div style={{fontSize:11,color:C.text,lineHeight:1.6,marginBottom:8}}>{nv.desc}</div>
                <div style={{display:"grid",gridTemplateColumns:"110px 1fr",gap:8,fontSize:10,lineHeight:1.6}}>
                  <div style={{fontWeight:"bold",color:nv.color}}>📋 Ejemplos:</div>
                  <div style={{color:C.textGray}}>{nv.ej}</div>
                  <div style={{fontWeight:"bold",color:nv.color}}>🎯 Función:</div>
                  <div style={{color:C.textGray}}>{nv.uso}</div>
                  <div style={{fontWeight:"bold",color:nv.color}}>📊 Criterio:</div>
                  <div style={{...sunken,background:"#fffff0",padding:"3px 8px",color:"#7a4400",fontSize:10}}>{nv.minimo}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{...raised,background:"#fffff0",padding:"10px 14px"}}>
          <div style={{fontSize:10,fontWeight:"bold",color:"#7a4400",marginBottom:8,textAlign:"center",letterSpacing:1}}>▼ FLUJO DE ANÁLISIS DEL MODELO INTEGRADOR ▼</div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <div style={{...raised,background:"#1565c0",color:"#fff",padding:"6px 30px",fontSize:11,fontWeight:"bold",minWidth:"60%",textAlign:"center"}}>🌀 NIVEL I — Patrón general (incluyente)</div>
            <div style={{color:C.textLight,fontSize:14}}>↓</div>
            <div style={{...raised,background:"#2e7d32",color:"#fff",padding:"6px 30px",fontSize:11,fontWeight:"bold",minWidth:"50%",textAlign:"center"}}>📍 NIVEL II — Minucias (identidad)</div>
            <div style={{color:C.textLight,fontSize:14}}>↓</div>
            <div style={{...raised,background:"#7a4400",color:"#fff",padding:"6px 30px",fontSize:11,fontWeight:"bold",minWidth:"40%",textAlign:"center"}}>🔬 NIVEL III — Detalles intrínsecos (originalidad)</div>
          </div>
          <div style={{fontSize:9,color:C.textGray,marginTop:8,textAlign:"center",fontStyle:"italic"}}>
            Cada nivel aporta información más específica y refuerza la conclusión pericial.
          </div>
        </div>
      </>}

      {/* GRÁFICO DE SUFICIENCIA */}
      {section==="suficiencia"&&<SeccionSuficiencia accent={accent}/>}

      {/* TIPS PRÁCTICOS */}
      {section==="tips"&&<>
        <div style={{...sunken,background:C.white,padding:"8px 12px",marginBottom:10,fontSize:11,lineHeight:1.6}}>
          Consejos prácticos para mejorar la calidad y velocidad de sus cotejos.
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {TIPS_PRACTICOS.map((t,i)=>(
            <div key={i} style={{...raised,background:C.winGray,padding:"10px 14px",display:"flex",alignItems:"flex-start",gap:12}}>
              <div style={{...sunken,background:"#fff",width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:"bold",color:accent,flexShrink:0}}>{i+1}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:"bold",color:accent,marginBottom:3}}>💡 {t.t}</div>
                <div style={{fontSize:10,color:C.textGray,lineHeight:1.6}}>{t.d}</div>
              </div>
            </div>
          ))}
        </div>
      </>}

    </div>
    {renderFooter()}
  </div>);
}



// ═══════════════════════════════════════════════════════════════════
// ── ACERCA DE SIMUSID ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
function AboutModal({onClose}){
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{...raised,background:C.winGray,width:520,maxWidth:"95vw",maxHeight:"90vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
      <div style={{...titleBarStyle,fontSize:11}}>
        ℹ️ Acerca de SIMUSID
        <button onClick={onClose} style={{...winBtn(false),marginLeft:"auto",padding:"0 6px",minWidth:20,fontSize:11}}>✕</button>
      </div>
      <div style={{padding:20,overflowY:"auto"}}>
        {/* Logo + título */}
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16,paddingBottom:14,borderBottom:`1px solid ${C.border}`}}>
          {/* Logo: huella circular concéntrica */}
          <svg width="60" height="60" viewBox="0 0 60 60" style={{flexShrink:0}}>
            {[26,21,16,11,6].map((r,i)=>(
              <circle key={i} cx="30" cy="30" r={r} fill="none" stroke={C.blue} strokeWidth="1.5"/>
            ))}
            <line x1="20" y1="20" x2="40" y2="40" stroke={C.blue} strokeWidth="1.5"/>
            <line x1="20" y1="40" x2="40" y2="20" stroke={C.blue} strokeWidth="1.5"/>
          </svg>
          <div>
            <div style={{fontSize:24,fontWeight:"bold",color:C.blue,letterSpacing:2}}>SIMUSID</div>
            <div style={{fontSize:10,color:C.textGray,lineHeight:1.4}}>
              Sistema de Identificación Dactiloscópica<br/>
              <b>Versión 1.0</b> · Build 2026
            </div>
          </div>
        </div>

        {/* Descripción */}
        <div style={{fontSize:11,lineHeight:1.7,color:C.text,marginBottom:14,textAlign:"justify"}}>
          <b style={{color:C.blue}}>SIMUSID</b> es una <b>plataforma académica</b> diseñada para la enseñanza y práctica de la <b>identificación dactiloscópica forense</b>. Permite a los estudiantes desarrollar competencias en el análisis de huellas dactilares mediante el cotejo de muestras dubitadas e indubitadas, identificación de puntos característicos (minucias) y elaboración de informes periciales.
        </div>

        {/* Características */}
        <div style={{fontSize:11,fontWeight:"bold",color:C.blue,marginBottom:6}}>▐ CARACTERÍSTICAS</div>
        <div style={{...sunken,background:C.white,padding:"10px 14px",marginBottom:14}}>
          {[
            {i:"🎓",t:"Tres roles diferenciados:",d:"Administrador, Docente y Estudiante con flujos de trabajo específicos."},
            {i:"🔍",t:"Editor de cotejos profesional:",d:"Herramientas forenses con marcas, filtros VUCSA y comparación sincronizada."},
            {i:"📚",t:"Material de estudio integrado:",d:"Glosario de minucias, tipos de huella y tips prácticos."},
            {i:"📊",t:"Seguimiento académico:",d:"Calificaciones, evolución del estudiante y analíticas del curso."},
            {i:"📄",t:"Informes periciales:",d:"Generación de dictámenes en PDF con formato forense estándar."},
          ].map((f,i)=>(
            <div key={i} style={{display:"flex",gap:10,padding:"4px 0",fontSize:10,lineHeight:1.5,borderBottom:i<4?"1px dotted #ddd":"none"}}>
              <span style={{fontSize:14,flexShrink:0}}>{f.i}</span>
              <div><b style={{color:C.blue}}>{f.t}</b> <span style={{color:C.textGray}}>{f.d}</span></div>
            </div>
          ))}
        </div>

        {/* Uso académico */}
        <div style={{...sunken,background:"#fffff0",padding:"10px 14px",marginBottom:14,fontSize:10,lineHeight:1.6,color:"#7a4400"}}>
          <b>📖 Uso Académico:</b> SIMUSID es una herramienta pedagógica diseñada para la formación universitaria en criminalística y ciencias forenses. Las muestras procesadas en esta plataforma son ejercicios académicos y <b>no tienen validez pericial oficial</b>.
        </div>

        {/* Créditos */}
        <div style={{...sunken,background:"#e8f0e8",padding:"10px 14px",fontSize:10,lineHeight:1.7,color:"#006400"}}>
          <b>🔬 Desarrollado para la formación de peritos en dactiloscopía.</b><br/>
          Diseñado con estética retro de los sistemas periciales clásicos y arquitectura web moderna.
          <div style={{marginTop:8,paddingTop:8,borderTop:"1px dotted #006400",display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:14}}>👨‍💻</span>
            <span><b>Autor:</b> Yeison Roman</span>
          </div>
        </div>
      </div>
      <div style={{padding:"8px 14px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:9,color:C.textLight,fontStyle:"italic"}}>ENTORNO ACADÉMICO DE PRÁCTICA</span>
        <button onClick={onClose} style={{...winBtn(),fontWeight:"bold"}}>✓ Cerrar</button>
      </div>
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════════
// ── AYUDA / ATAJOS DE TECLADO ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
function HelpModal({onClose,context="general"}){
  const shortcuts={
    editor:[
      {key:"Ctrl + Z",d:"Deshacer última acción"},
      {key:"Ctrl + Y",d:"Rehacer"},
      {key:"Ctrl + S",d:"Guardar manualmente (autoguardado activo)"},
      {key:"Supr / ⌫",d:"Eliminar punto seleccionado"},
      {key:"Clic + Arrastrar",d:"Mover puntos en la huella"},
      {key:"Doble clic",d:"Rotar etiqueta numérica de un punto"},
      {key:"Rueda del ratón",d:"Zoom en la huella"},
    ],
    general:[
      {key:"Enter",d:"Confirmar diálogos y formularios"},
      {key:"Escape",d:"Cerrar modales y diálogos"},
      {key:"Tab",d:"Avanzar entre campos de texto"},
    ],
  };
  const tools=[
    {icon:"⊹",n:"Selección",d:"Seleccionar y mover marcas existentes"},
    {icon:"○",n:"Círculo",d:"Marca un punto característico (minucia)"},
    {icon:"✏",n:"Calidad",d:"Trazo a mano alzada para resaltar zonas"},
    {icon:"⌒",n:"Crestas",d:"Dibujar líneas siguiendo las crestas papilares"},
    {icon:"✥",n:"Pan",d:"Mover la imagen dentro del panel"},
    {icon:"🎨",n:"Color",d:"Cambiar el color de las próximas marcas"},
    {icon:"👁",n:"Capas",d:"Mostrar/ocultar imágenes, minucias, etiquetas, etc."},
  ];
  const minitoolbar=[
    {icon:"↔ ↕ 🔄",n:"Voltear / Rotar",d:"Voltear imagen horizontal, vertical o rotar 90°"},
    {icon:"☀ 🌙",n:"Brillo",d:"Aumentar o reducir el brillo"},
    {icon:"◐ ◑",n:"Contraste",d:"Aumentar o reducir el contraste"},
    {icon:"⚫",n:"Blanco y negro",d:"Convertir a escala de grises"},
    {icon:"⊖",n:"Invertir",d:"Invertir colores (negativo)"},
    {icon:"V",n:"VUCSA",d:"Filtro Visualización Ultra-Contrastada en Sepia Atenuada"},
    {icon:"R",n:"RIDGES",d:"Resaltar crestas papilares automáticamente"},
    {icon:"🔍+ 🔍-",n:"Zoom",d:"Acercar o alejar la imagen"},
    {icon:"1:1",n:"Zoom 100%",d:"Restablecer zoom a tamaño original"},
    {icon:"↺",n:"Reset filtros",d:"Restablecer todos los filtros de imagen"},
  ];
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{...raised,background:C.winGray,width:580,maxWidth:"95vw",maxHeight:"90vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
      <div style={{...titleBarStyle,fontSize:11}}>
        ❓ Ayuda y Atajos de Teclado
        <button onClick={onClose} style={{...winBtn(false),marginLeft:"auto",padding:"0 6px",minWidth:20,fontSize:11}}>✕</button>
      </div>
      <div style={{padding:16,overflowY:"auto"}}>
        <div style={{...sunken,background:"#fffff0",padding:"8px 12px",fontSize:10,color:"#7a6000",marginBottom:12,lineHeight:1.6}}>
          ℹ Los atajos funcionan principalmente dentro del <b>editor de cotejos</b>. Aquí encontrará también una guía rápida de las herramientas disponibles.
        </div>

        <div style={{fontSize:11,fontWeight:"bold",color:C.blue,marginBottom:6}}>▐ ATAJOS DEL EDITOR</div>
        <div style={{...sunken,background:C.white,padding:8,marginBottom:12}}>
          {shortcuts.editor.map((s,i)=>(<div key={i} style={{display:"grid",gridTemplateColumns:"140px 1fr",gap:8,padding:"3px 4px",fontSize:11,borderBottom:i<shortcuts.editor.length-1?"1px dotted #ccc":"none"}}>
            <span style={{fontFamily:FONT,background:"#eee",padding:"1px 5px",fontWeight:"bold",color:C.blue,textAlign:"center"}}>{s.key}</span>
            <span style={{color:C.textGray}}>{s.d}</span>
          </div>))}
        </div>

        <div style={{fontSize:11,fontWeight:"bold",color:C.blue,marginBottom:6}}>▐ ATAJOS GENERALES</div>
        <div style={{...sunken,background:C.white,padding:8,marginBottom:12}}>
          {shortcuts.general.map((s,i)=>(<div key={i} style={{display:"grid",gridTemplateColumns:"140px 1fr",gap:8,padding:"3px 4px",fontSize:11,borderBottom:i<shortcuts.general.length-1?"1px dotted #ccc":"none"}}>
            <span style={{fontFamily:FONT,background:"#eee",padding:"1px 5px",fontWeight:"bold",color:C.blue,textAlign:"center"}}>{s.key}</span>
            <span style={{color:C.textGray}}>{s.d}</span>
          </div>))}
        </div>

        <div style={{fontSize:11,fontWeight:"bold",color:"#006400",marginBottom:6}}>▐ HERRAMIENTAS DEL EDITOR</div>
        <div style={{...sunken,background:C.white,padding:8,marginBottom:12}}>
          {tools.map((t,i)=>(<div key={i} style={{display:"grid",gridTemplateColumns:"30px 110px 1fr",gap:8,padding:"3px 4px",fontSize:11,borderBottom:i<tools.length-1?"1px dotted #ccc":"none"}}>
            <span style={{textAlign:"center",fontSize:14}}>{t.icon}</span>
            <span style={{fontWeight:"bold",color:"#006400"}}>{t.n}</span>
            <span style={{color:C.textGray}}>{t.d}</span>
          </div>))}
        </div>

        <div style={{fontSize:11,fontWeight:"bold",color:"#7a4400",marginBottom:6}}>▐ MINI-BARRA DE CADA MUESTRA</div>
        <div style={{...sunken,background:"#fffff0",padding:"6px 10px",fontSize:9,color:"#7a6000",marginBottom:6,lineHeight:1.5}}>
          Cada muestra (A y B) tiene su propia barra de filtros arriba. Pase el ratón sobre cada icono para ver su función.
        </div>
        <div style={{...sunken,background:C.white,padding:8,marginBottom:12}}>
          {minitoolbar.map((f,i)=>(<div key={i} style={{display:"grid",gridTemplateColumns:"110px 110px 1fr",gap:8,padding:"3px 4px",fontSize:11,borderBottom:i<minitoolbar.length-1?"1px dotted #ccc":"none"}}>
            <span style={{fontFamily:FONT,fontSize:13,textAlign:"center",color:"#7a4400"}}>{f.icon}</span>
            <span style={{fontWeight:"bold",color:"#7a4400"}}>{f.n}</span>
            <span style={{color:C.textGray}}>{f.d}</span>
          </div>))}
        </div>

        <div style={{...sunken,background:"#e8f0e8",padding:"8px 12px",fontSize:10,color:"#006400",lineHeight:1.6,marginBottom:8}}>
          💡 <b>Consejo:</b> presione <b>Ctrl+S</b> después de cada par de minucias importantes. El sistema guarda automáticamente, pero es buena práctica forense confirmar.
        </div>
      </div>
      <div style={{padding:"8px 12px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{...winBtn(),fontWeight:"bold"}}>✓ Entendido</button>
      </div>
    </div>
  </div>);
}


// ═══════════════════════════════════════════════════════════════════
// ── VERIFICACIÓN (V de ACE-V) ─────────────────────────────────────
// Comparativa lado a lado: marcas del estudiante vs marcas del docente
// sobre las mismas huellas. Solo lectura, sin registro formal.
// ═══════════════════════════════════════════════════════════════════
function VerificacionScreen({cotejoEst, cotejoDoc, images, onClose}){
  // Nombre real del estudiante dueño del cotejo
  const _est=Object.values(loadStore().estudiantes||{}).find(e=>e.cedula===cotejoEst?.studentId);
  const studentName=_est?`${_est.nombre} ${_est.apellido}`:"Estudiante";
  const imgA = images[cotejoEst.imgA];
  const imgB = images[cotejoEst.imgB];

  const Sample = ({img, shapes, color}) => {
    // Las marcas están guardadas en píxeles REALES de la imagen, así que el
    // viewBox debe usar las dimensiones naturales (no un tamaño fijo).
    const [dims,setDims]=useState(null);
    if(!img) return <div style={{background:"#eee",padding:30,textAlign:"center",color:C.textLight,fontSize:11}}>Sin imagen</div>;
    const sw=dims?Math.max(2,dims.w/250):2;        // grosor del trazo proporcional
    const fs=dims?Math.max(14,dims.w/35):14;       // tamaño de la etiqueta proporcional
    return(
      <div style={{position:"relative",display:"inline-block",background:"#000",maxWidth:"100%"}}>
        <img src={img.src} onLoad={e=>setDims({w:e.target.naturalWidth||500,h:e.target.naturalHeight||500})} style={{display:"block",maxWidth:"100%",height:"auto"}}/>
        {dims&&<svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}} viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none">
          {(shapes||[]).map((s,i)=>{
            if(s.type==="circle"&&s.x!=null) return(<g key={i}>
              <circle cx={s.x} cy={s.y} r={s.r||fs} fill="none" stroke={s.color||color} strokeWidth={sw}/>
              {s.label&&<text x={s.x+(s.r||fs)+sw*2} y={s.y+fs*0.35} fill={s.color||color} stroke="#fff" strokeWidth={sw*0.15} fontSize={fs} fontWeight="bold" fontFamily="monospace">{s.label}</text>}
            </g>);
            if((s.type==="freehand"||s.type==="polyline")&&s.points) return <polyline key={i} points={s.points.map(p=>`${p.x},${p.y}`).join(" ")} fill="none" stroke={s.color||color} strokeWidth={sw}/>;
            return null;
          })}
        </svg>}
      </div>
    );
  };

  return(<div style={{background:C.winGray,minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:FONT,color:C.text}}>
    <div style={{...titleBarStyle,fontSize:11,display:"flex",alignItems:"center"}}>
      <span>⚖ Verificación — {cotejoEst.name}</span>
      <button onClick={onClose} style={{...winBtn(),marginLeft:"auto",fontSize:10,padding:"2px 12px",color:"#000"}}>✕ Cerrar</button>
    </div>

    <div style={{flex:1,...sunken,margin:8,background:C.winGray,padding:14,overflowY:"auto"}}>
      {/* Muestra A */}
      <div style={{fontSize:11,fontWeight:"bold",color:C.text,marginBottom:6}}>DUBITADA</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
        <div>
          <div style={{fontSize:10,color:C.blue,marginBottom:4,fontWeight:"bold"}}>{studentName}</div>
          <Sample img={imgA} shapes={cotejoEst.leftShapes} color={C.blue}/>
        </div>
        <div>
          <div style={{fontSize:10,color:"#cc4400",marginBottom:4,fontWeight:"bold"}}>Verificador (Docente)</div>
          <Sample img={imgA} shapes={cotejoDoc.leftShapes} color="#cc4400"/>
        </div>
      </div>

      {/* Muestra B */}
      <div style={{fontSize:11,fontWeight:"bold",color:C.text,marginBottom:6}}>INDUBITADA</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>
          <div style={{fontSize:10,color:C.blue,marginBottom:4,fontWeight:"bold"}}>{studentName}</div>
          <Sample img={imgB} shapes={cotejoEst.rightShapes} color={C.blue}/>
        </div>
        <div>
          <div style={{fontSize:10,color:"#cc4400",marginBottom:4,fontWeight:"bold"}}>Verificador (Docente)</div>
          <Sample img={imgB} shapes={cotejoDoc.rightShapes} color="#cc4400"/>
        </div>
      </div>

      {/* Tabla comparativa de puntos característicos */}
      {(()=>{
        const namesEst = cotejoEst.pointNames||[];
        const namesDoc = cotejoDoc.pointNames||[];
        // Recolectar TODOS los labels marcados por estudiante y docente (en A o B)
        const labelsEst = new Set();
        const labelsDoc = new Set();
        (cotejoEst.leftShapes||[]).forEach(s=>s.label&&labelsEst.add(s.label));
        (cotejoEst.rightShapes||[]).forEach(s=>s.label&&labelsEst.add(s.label));
        (cotejoDoc.leftShapes||[]).forEach(s=>s.label&&labelsDoc.add(s.label));
        (cotejoDoc.rightShapes||[]).forEach(s=>s.label&&labelsDoc.add(s.label));

        // Conteo de PARES (presente en A y B) para el resumen
        const paresEst = [...labelsEst].filter(l=>
          (cotejoEst.leftShapes||[]).some(s=>s.label===l) &&
          (cotejoEst.rightShapes||[]).some(s=>s.label===l)
        ).length;
        const paresDoc = [...labelsDoc].filter(l=>
          (cotejoDoc.leftShapes||[]).some(s=>s.label===l) &&
          (cotejoDoc.rightShapes||[]).some(s=>s.label===l)
        ).length;

        const todos = [...new Set([...labelsEst,...labelsDoc])].sort((a,b)=>a-b);
        if(todos.length===0) return(
          <div style={{marginTop:20,...sunken,background:C.white,padding:20,textAlign:"center",fontSize:11,color:C.textLight,fontStyle:"italic"}}>
            No hay puntos característicos identificados todavía.
          </div>
        );

        const rows = todos.map(i=>({
          n:i,
          tipoE: labelsEst.has(i) ? (namesEst[i-1]||`Punto ${i}`) : null,
          tipoD: labelsDoc.has(i) ? (namesDoc[i-1]||`Punto ${i}`) : null,
        }));

        return(<div style={{marginTop:20}}>
          <div style={{fontSize:11,fontWeight:"bold",color:C.text,marginBottom:6}}>Puntos característicos identificados</div>
          <div style={{...sunken,background:C.white,padding:0,overflow:"hidden"}}>
            {/* Encabezado de tabla */}
            <div style={{display:"grid",gridTemplateColumns:"50px 1fr 1fr",background:C.winGray2,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:"bold"}}>
              <div style={{padding:"5px 8px",textAlign:"center",borderRight:`1px solid ${C.border}`}}>N°</div>
              <div style={{padding:"5px 8px",color:C.blue,borderRight:`1px solid ${C.border}`}}>{studentName}</div>
              <div style={{padding:"5px 8px",color:"#cc4400"}}>Verificador</div>
            </div>
            {rows.map((r,i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"50px 1fr 1fr",fontSize:10,borderBottom:i<rows.length-1?`1px dotted ${C.border}`:"none",background:i%2?"#f8f8f8":"transparent"}}>
                <div style={{padding:"5px 8px",textAlign:"center",fontWeight:"bold",borderRight:`1px solid ${C.border}`}}>{r.n}</div>
                <div style={{padding:"5px 8px",color:r.tipoE?C.text:C.textLight,fontStyle:r.tipoE?"normal":"italic",borderRight:`1px solid ${C.border}`}}>{r.tipoE||"— no marcado —"}</div>
                <div style={{padding:"5px 8px",color:r.tipoD?C.text:C.textLight,fontStyle:r.tipoD?"normal":"italic"}}>{r.tipoD||"— no marcado —"}</div>
              </div>
            ))}
            {/* Resumen */}
            <div style={{padding:"6px 10px",background:C.winGray2,borderTop:`1px solid ${C.border}`,fontSize:10,display:"flex",justifyContent:"space-between"}}>
              <span style={{color:C.blue}}><b>{studentName}:</b> {paresEst} par{paresEst===1?"":"es"}</span>
              <span style={{color:"#cc4400"}}><b>Verificador:</b> {paresDoc} par{paresDoc===1?"":"es"}</span>
            </div>
          </div>
        </div>);
      })()}
    </div>
  </div>);
}


// ── ROOT ──────────────────────────────────────────────────────────
// ── MODAL: cambio de contraseña obligatorio (primer ingreso) ─────
function ChangePasswordModal({onDone}){
  const [p1,setP1]=useState(""),[p2,setP2]=useState(""),[err,setErr]=useState(""),[busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy)return;
    if(p1.length<6){setErr("Mínimo 6 caracteres.");return;}
    if(p1!==p2){setErr("Las contraseñas no coinciden.");return;}
    setBusy(true);setErr("");
    try{ await api.changeMyPassword(p1); onDone(); }
    catch(e){ setErr(e.message||"Error al cambiar la contraseña"); setBusy(false); }
  };
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT}}>
    <div style={{...raised,background:C.winGray,width:380,maxWidth:"95vw"}}>
      <div style={{...titleBarStyle,fontSize:12}}>🔑 Cambio de contraseña obligatorio</div>
      <div style={{padding:18,display:"flex",flexDirection:"column",gap:10}}>
        <div style={{...sunken,background:"#fffff0",padding:"8px 12px",fontSize:10,color:"#7a6000",lineHeight:1.6}}>
          Por seguridad, debe definir una <b>contraseña propia</b> antes de continuar. Su clave temporal deja de funcionar.
        </div>
        {[{l:"Nueva contraseña:",v:p1,s:setP1},{l:"Repítala:",v:p2,s:setP2}].map(f=>(
          <div key={f.l} style={{display:"grid",gridTemplateColumns:"130px 1fr",alignItems:"center",gap:8}}>
            <label style={{fontSize:11,fontWeight:"bold",textAlign:"right"}}>{f.l}</label>
            <input type="password" value={f.v} onChange={e=>f.s(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
              style={{...sunken,fontFamily:FONT,fontSize:12,padding:"4px 8px",outline:"none",background:C.white}}/>
          </div>
        ))}
        {err&&<div style={{background:"#ffcccc",border:"1px solid #cc0000",padding:"5px 10px",fontSize:10,color:C.red,textAlign:"center"}}>{err}</div>}
        <button onClick={submit} disabled={busy} style={{...winBtn(),fontWeight:"bold",padding:"7px 0",color:busy?C.textLight:C.blue}}>{busy?"Guardando...":"✓ Guardar contraseña"}</button>
      </div>
    </div>
  </div>);
}

export default function App(){
  const [screen,setScreen]=useState("loading"); // loading | login | home | compare
  const [cotejoId,setCotejoId]=useState(null);
  const [role,setRole]=useState(null);
  const [studentData,setStudentData]=useState(null);
  const [mustChangePass,setMustChangePass]=useState(false);

  // Restaurar sesión existente al cargar la página
  useEffect(()=>{
    (async()=>{
      try{
        const prof=await api.restoreSession();
        if(prof){
          setRole(prof.role);
          if(prof.role==="estudiante") setStudentData({cedula:prof.cedula,nombre:prof.nombre,apellido:prof.apellido});
          setMustChangePass(!!prof.must_change_password);
          setScreen("home");
        } else setScreen("login");
      }catch(e){ setScreen("login"); }
    })();
  },[]);

  // Sincronizar pendientes antes de cerrar la pestaña
  useEffect(()=>{
    const h=()=>{ api.flushSync(); };
    window.addEventListener("beforeunload",h);
    return()=>window.removeEventListener("beforeunload",h);
  },[]);

  const login=(r,estData)=>{
    setRole(r);setStudentData(estData||null);
    setMustChangePass(!!api.getMe()?.must_change_password);
    setScreen("home");
  };
  const logout=async()=>{await api.signOut();setScreen("login");setCotejoId(null);setRole(null);setStudentData(null);setMustChangePass(false);};
  const enter=(id)=>{setCotejoId(id);setScreen("compare");};
  const home=()=>{setScreen("home");setCotejoId(null);};

  if(screen==="loading") return(
    <div style={{background:C.winGray2,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT}}>
      <div style={{...raised,background:C.winGray,padding:"24px 40px",textAlign:"center"}}>
        <FpLogo size={56} stroke={C.blue}/>
        <div style={{fontWeight:"bold",fontSize:14,color:C.blue,letterSpacing:3,marginTop:10}}>SIMUSID</div>
        <div style={{fontSize:10,color:C.textLight,marginTop:6}}>Conectando con el servidor...</div>
      </div>
    </div>
  );
  if(screen==="login") return <LoginScreen onLogin={login}/>;

  const passModal = mustChangePass ? <ChangePasswordModal onDone={()=>setMustChangePass(false)}/> : null;
  if(screen==="compare"&&cotejoId) return <>{passModal}<CompareScreen cotejoId={cotejoId} onBack={home} onLogout={logout}/></>;
  if(role==="docente") return <>{passModal}<DocentePanel onLogout={logout}/></>;
  if(role==="estudiante") return <>{passModal}<EstudiantePanel onLogout={logout} studentData={studentData}/></>;
  return <>{passModal}<HomeScreen onEnterCotejo={enter} onLogout={logout}/></>;
}
