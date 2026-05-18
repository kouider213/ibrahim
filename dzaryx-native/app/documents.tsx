import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { BACKEND_URL } from '../lib/api';
import { useStore } from '../lib/store';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

const DOC_TYPES = [
  { key: 'passeport', label: '🛂 PASSEPORT', msg: (n: string) => `récupère et envoie moi le passeport de ${n}` },
  { key: 'permis',    label: '🚗 PERMIS',    msg: (n: string) => `récupère et envoie moi le permis de conduire de ${n}` },
  { key: 'contrat',   label: '📝 CONTRAT',   msg: (n: string) => `récupère et envoie moi le contrat de location de ${n}` },
];

export default function DocumentsScreen() {
  const router       = useRouter();
  const mobileToken  = useStore(s => s.mobileToken);
  const sessionIdFn  = useStore(s => s.sessionId);

  const [name, setName]         = useState('');
  const [loading, setLoad]      = useState(false);
  const [result, setResult]     = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanR]  = useState('');

  const fetchDoc = async (docKey: string) => {
    const n = name.trim();
    if (!n) { Alert.alert('Erreur', 'Entre le nom du client'); return; }
    const docType = DOC_TYPES.find(d => d.key === docKey);
    if (!docType) return;
    setLoad(true); setResult('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mobileToken()}` },
        body: JSON.stringify({ message: docType.msg(n), sessionId: sessionIdFn() }),
      });
      const data = await res.json() as { text?: string };
      setResult(data.text ?? 'Pas de réponse');
    } catch (e) {
      setResult(`Erreur: ${e}`);
    } finally { setLoad(false); }
  };

  const handleScan = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'], base64: true, quality: 0.8,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const b64  = result.assets[0].base64;
    const mime = result.assets[0].mimeType ?? 'image/jpeg';
    setScanning(true); setScanR('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/vision/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mobileToken()}` },
        body: JSON.stringify({ imageBase64: b64, mimeType: mime }),
      });
      const data = await res.json() as { description: string; type: string };
      setScanR(`[${data.type}]\n${data.description}`);
    } catch (e) {
      setScanR(`Erreur: ${e}`);
    } finally { setScanning(false); }
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>DOCUMENTS CLIENTS</Text>
      </View>

      {/* Fetch document */}
      <View style={s.card}>
        <Text style={s.cardTitle}>RÉCUPÉRER DOCUMENT</Text>
        <TextInput
          value={name} onChangeText={setName}
          placeholder="Nom du client…" placeholderTextColor="#333"
          style={s.input}
        />
        <View style={s.row}>
          {DOC_TYPES.map(d => (
            <TouchableOpacity
              key={d.key}
              onPress={() => void fetchDoc(d.key)}
              disabled={loading}
              style={[s.docBtn, { opacity: loading ? 0.5 : 1 }]}
            >
              <Text style={s.docIcon}>{d.label.split(' ')[0]}</Text>
              <Text style={s.docLabel}>{d.label.split(' ')[1]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {loading && <Text style={s.status}>Récupération en cours…</Text>}
        {!!result && (
          <View style={s.resultBox}>
            <Text style={s.resultText}>{result}</Text>
          </View>
        )}
      </View>

      {/* OCR Scan */}
      <View style={[s.card, { borderColor: '#ffb34733' }]}>
        <Text style={[s.cardTitle, { color: '#ffb347aa' }]}>SCAN OCR DOCUMENT</Text>
        <Text style={s.hint}>Scanne un passeport, permis ou contrat.</Text>
        <TouchableOpacity
          onPress={() => void handleScan()}
          disabled={scanning}
          style={[s.scanBtn, { opacity: scanning ? 0.6 : 1 }]}
        >
          <Text style={s.scanTxt}>{scanning ? '⏳  ANALYSE…' : '📷  PRENDRE PHOTO'}</Text>
        </TouchableOpacity>
        {!!scanResult && (
          <View style={[s.resultBox, { borderColor: '#ffb34733' }]}>
            <Text style={[s.resultText, { color: '#ffb347cc' }]}>{scanResult}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#020810' },
  header:     { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 24, borderBottomWidth: 1, borderColor: '#00d4ff12' },
  back:       { marginRight: 12, padding: 4 },
  backTxt:    { color: '#00d4ff', fontSize: 20, fontFamily: MONO },
  title:      { color: '#00d4ff', fontFamily: MONO, fontSize: 11, letterSpacing: 4 },
  card:       { margin: 12, borderRadius: 12, backgroundColor: '#0a1520', borderWidth: 1, borderColor: '#00d4ff15', padding: 14 },
  cardTitle:  { color: '#00d4ff88', fontFamily: MONO, fontSize: 8, letterSpacing: 3, marginBottom: 10 },
  input:      { backgroundColor: '#03080f', borderWidth: 1, borderColor: '#00d4ff22', borderRadius: 8, padding: 10, color: '#fff', fontFamily: MONO, fontSize: 13, marginBottom: 10 },
  row:        { flexDirection: 'row', gap: 8 },
  docBtn:     { flex: 1, backgroundColor: '#03080f', borderWidth: 1, borderColor: '#00d4ff22', borderRadius: 8, padding: 10, alignItems: 'center' },
  docIcon:    { fontSize: 20, marginBottom: 4 },
  docLabel:   { color: '#00d4ffaa', fontFamily: MONO, fontSize: 8, letterSpacing: 2 },
  status:     { color: '#00d4ff55', fontFamily: MONO, fontSize: 9, marginTop: 8, textAlign: 'center' },
  resultBox:  { marginTop: 10, backgroundColor: '#03080f', borderRadius: 8, borderWidth: 1, borderColor: '#00d4ff22', padding: 10 },
  resultText: { color: '#00d4ffcc', fontFamily: MONO, fontSize: 10, lineHeight: 16 },
  hint:       { color: '#ffffff44', fontFamily: MONO, fontSize: 9, marginBottom: 10, lineHeight: 16 },
  scanBtn:    { backgroundColor: '#ffb34711', borderWidth: 1, borderColor: '#ffb34766', borderRadius: 8, padding: 14, alignItems: 'center' },
  scanTxt:    { color: '#ffb347cc', fontFamily: MONO, fontSize: 12, letterSpacing: 2 },
});
