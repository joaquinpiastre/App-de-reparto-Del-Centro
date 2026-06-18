import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { REGION_SAN_RAFAEL } from '@/constants/mapRegion';
import { separarPuntosSuperpuestos } from '@/lib/mapaUtil';
import type { RecorridoPoint, RecorridoStop, VisitStop } from '@/services/adminReportes';

interface Props {
  points: RecorridoPoint[];
  stops: RecorridoStop[];
  visitStops?: VisitStop[];
}

export function MapaRecorridoHistorial({ points, stops, visitStops = [] }: Props) {
  const srcDoc = useMemo(() => {
    const visitStopsSeparados = separarPuntosSuperpuestos(visitStops);
    const stopsSeparados = separarPuntosSuperpuestos(stops);
    const safePoints      = JSON.stringify(points).replace(/</g, '\\u003c');
    const safeStops       = JSON.stringify(stopsSeparados).replace(/</g, '\\u003c');
    const safeVisitStops  = JSON.stringify(visitStopsSeparados).replace(/</g, '\\u003c');
    const lat0 = REGION_SAN_RAFAEL.latitude;
    const lng0 = REGION_SAN_RAFAEL.longitude;

    return `<!doctype html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map{height:100%;margin:0;padding:0}
  .popup{font-family:Arial,sans-serif;font-size:12px;line-height:1.6;min-width:140px}
  .popup b{display:block;font-size:13px;margin-bottom:2px}
</style>
</head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var points=${safePoints};
var stops=${safeStops};
var visitStops=${safeVisitStops};

var map=L.map('map');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19,
  attribution:'&copy; OpenStreetMap contributors'
}).addTo(map);

function makeVisitIcon(color,num){
  return L.divIcon({
    html:'<div style="width:28px;height:28px;background:'+color+';border-radius:50%;border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.4)">'+num+'</div>',
    iconSize:[28,28],
    iconAnchor:[14,14],
    popupAnchor:[0,-16],
    className:''
  });
}

/* ─── Traza GPS ─────────────────────────────────────────────── */
if(points.length){
  var latlngs=points.map(function(p){return[p.lat,p.lng];});
  var line=L.polyline(latlngs,{color:'#2196F3',weight:4,opacity:0.8}).addTo(map);

  L.marker([points[0].lat,points[0].lng])
    .addTo(map)
    .bindPopup('<div class="popup"><b>Inicio del turno</b></div>');

  L.marker([points[points.length-1].lat,points[points.length-1].lng])
    .addTo(map)
    .bindPopup('<div class="popup"><b>Fin del turno</b></div>');

  stops.forEach(function(s,i){
    var mins=Math.round((s.duracionSegundos||0)/60);
    L.circleMarker([s.lat,s.lng],{
      radius:7,color:'#f59e0b',fillColor:'#f59e0b',fillOpacity:0.9,weight:2
    }).addTo(map)
     .bindPopup('<div class="popup"><b>Parada GPS '+(i+1)+'</b>'+(mins>0?mins+' min detenido':'')+'</div>');
  });

  map.fitBounds(line.getBounds(),{padding:[28,28]});
}

/* ─── Visitas marcadas por el repartidor ────────────────────── */
visitStops.forEach(function(v,i){
  var color=v.estado==='entregado'?'#22c55e':'#f97316';
  var mins=Math.round((v.duracionSegundos||0)/60);
  var statusText=v.estado==='entregado'?'&#10003; Entregado':'&#9888; Problema';
  var timeText=mins>0?'<br/>'+mins+' min en el lugar':'';
  L.marker([v.lat,v.lng],{icon:makeVisitIcon(color,i+1)})
   .addTo(map)
   .bindPopup('<div class="popup"><b>'+v.nombre+'</b>'+statusText+timeText+'</div>');
});

/* ─── Centrar cuando no hay traza GPS pero sí visitas ──────── */
if(!points.length&&visitStops.length){
  var vlats=visitStops.map(function(v){return v.lat;});
  var vlngs=visitStops.map(function(v){return v.lng;});
  if(visitStops.length===1){
    map.setView([vlats[0],vlngs[0]],15);
  } else {
    map.fitBounds(
      [[Math.min.apply(null,vlats),Math.min.apply(null,vlngs)],
       [Math.max.apply(null,vlats),Math.max.apply(null,vlngs)]],
      {padding:[40,40]}
    );
  }
}

/* ─── Sin datos: centrar en San Rafael ─────────────────────── */
if(!points.length&&!visitStops.length){
  map.setView([${lat0},${lng0}],13);
}

/* ─── Leyenda ───────────────────────────────────────────────── */
if(visitStops.length>0){
  var legend=L.control({position:'bottomright'});
  legend.onAdd=function(){
    var div=L.DomUtil.create('div');
    div.style.cssText='background:#fff;padding:8px 12px;border-radius:8px;font-family:Arial;font-size:11px;box-shadow:0 2px 8px rgba(0,0,0,0.2);line-height:1.8';
    var dot=function(c){return '<span style="display:inline-block;width:11px;height:11px;background:'+c+';border-radius:50%;margin-right:5px;vertical-align:middle"></span>';};
    div.innerHTML='<b style="display:block;margin-bottom:3px">Referencias</b>'+dot('#22c55e')+'Entregado<br/>'+dot('#f97316')+'Problema<br/>'+dot('#f59e0b')+'Parada GPS';
    return div;
  };
  legend.addTo(map);
}
</script>
</body></html>`;
  }, [points, stops, visitStops]);

  if (points.length === 0 && visitStops.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Sin puntos GPS para esta jornada.</Text>
        <Text style={styles.emptyHint}>
          El recorrido se registra solo si el repartidor tiene permisos de ubicación en segundo plano.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {React.createElement('iframe', {
        title: 'Mapa historial recorrido',
        srcDoc,
        style: styles.mapFrame as unknown as React.CSSProperties,
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  mapFrame: {
    borderWidth: 0,
    borderRadius: 16,
    width: '100%',
    minHeight: 400,
    backgroundColor: '#e8eef0',
  },
  empty: {
    minHeight: 180,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 6,
  },
  emptyText: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.grisSecundario,
    textAlign: 'center',
  },
  emptyHint: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: COLORS.grisSecundario,
    textAlign: 'center',
    lineHeight: 17,
  },
});
