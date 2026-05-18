import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { io, Socket } from 'socket.io-client';
import { Audio } from 'expo-av';
import { BACKEND_URL, MOBILE_TOKEN } from '../lib/api';

interface Message {
  id: string; role: 'user' | 'ai'; text: string; ts: string;
  status?: 'sending' | 'done' | 'error';
}

function now() { return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function uid()  { return Math.random().toString(36).slice(2); }

export default function TextScreen() {
  const router = useRouter();

  const [msgs, setMsgs]         = useState<Message[]>([{
    id: '0', role: 'ai', text: 'Salut, je suis Dzaryx. Comment puis-je t\'aider ?', ts: now(), status: 'done',
  }]);
  const [input, setInput]       = useState('');
  const [thinking, setThinking] = useState(false);
  const [wsConn, setWsConn]     = useState(false);
  const flatRef                  = useRef<FlatList>(null);
  const socketRef                = useRef<Socket | null>(null);
  const sessionId                = 'voice_kouider';
  const streamingId              = useRef<string | null>(null);

  useEffect(() => {
    const sock = io(`${BACKEND_URL}/mobile`, {
      auth:         { token: MOBILE_TOKEN },
      transports:   ['websocket', 'polling'],
      reconnection: true,
    });

    sock.on('connect',    () => setWsConn(true));
    sock.on('disconnect', () => setWsConn(false));

    sock.on('Dzaryx:text_chunk', (d: { chunk: string; sessionId?: string }) => {
      if (d.sessionId && d.sessionId !== sessionId) return;
      if (streamingId.current) {
        setMsgs(ms => ms.map(m =>
          m.id === streamingId.current ? { ...m, text: m.text + d.chunk } : m
        ));
      }
    });

    sock.on('Dzaryx:text_complete', (d: { text: string; sessionId?: string }) => {
      if (d.sessionId && d.sessionId !== sessionId) return;
      if (streamingId.current) {
        setMsgs(ms => ms.map(m =>
          m.id === streamingId.current ? { ...m, text: d.text, status: 'done' } : m
        ));
        streamingId.current = null;
      }
      setThinking(false);
    });

    sock.on('Dzaryx:response', (d: { text: string; fallback?: boolean; sessionId?: string }) => {
      if (d.sessionId && d.sessionId !== sessionId) return;
      if (streamingId.current) {
        setMsgs(ms => ms.map(m =>
          m.id === streamingId.current ? { ...m, text: d.text, status: 'done' } : m
        ));
        streamingId.current = null;
      } else {
        setMsgs(ms => [...ms, { id: uid(), role: 'ai', text: d.text, ts: now(), status: 'done' }]);
      }
      setThinking(false);
    });

    sock.on('Dzaryx:audio', async (d: { audio: string }) => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: `data:audio/mp3;base64,${d.audio}` },
          { shouldPlay: true },
        );
        sound.setOnPlaybackStatusUpdate(s => {
          if (s.isLoaded && s.didJustFinish) sound.unloadAsync().catch(() => {});
        });
      } catch { /* ignore */ }
    });

    sock.on('Dzaryx:proactive', (d: { text: string }) => {
      setMsgs(ms => [...ms, { id: uid(), role: 'ai', text: `📡 ${d.text}`, ts: now(), status: 'done' }]);
    });

    socketRef.current = sock;
    return () => { sock.disconnect(); socketRef.current = null; };
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking) return;

    const userMsg: Message = { id: uid(), role: 'user', text, ts: now(), status: 'done' };
    const aiMsg: Message   = { id: uid(), role: 'ai',   text: '',  ts: now(), status: 'sending' };
    setMsgs(ms => [...ms, userMsg, aiMsg]);
    streamingId.current = aiMsg.id;
    setInput('');
    setThinking(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MOBILE_TOKEN}` },
        body: JSON.stringify({ message: text, sessionId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json() as { text?: string; audio?: string };
      if (data.text && streamingId.current) {
        setMsgs(ms => ms.map(m =>
          m.id === streamingId.current ? { ...m, text: data.text!, status: 'done' } : m
        ));
        streamingId.current = null;
      }
      if (data.audio) {
        const { sound } = await Audio.Sound.createAsync(
          { uri: `data:audio/mp3;base64,${data.audio}` },
          { shouldPlay: true },
        );
        sound.setOnPlaybackStatusUpdate(s => {
          if (s.isLoaded && s.didJustFinish) sound.unloadAsync().catch(() => {});
        });
      }
    } catch {
      if (streamingId.current) {
        setMsgs(ms => ms.map(m =>
          m.id === streamingId.current ? { ...m, text: '⚠️ Erreur réseau', status: 'error' } : m
        ));
        streamingId.current = null;
      }
    } finally {
      setThinking(false);
    }
  }, [input, thinking]);

  useEffect(() => {
    if (msgs.length) setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
  }, [msgs]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={[styles.avatar, { borderColor: wsConn ? '#00d4e8' : '#ff336666' }]}>
            <Text style={styles.avatarLetter}>D</Text>
          </View>
          <View>
            <Text style={styles.headerName}>DZARYX</Text>
            <Text style={styles.headerStatus}>{wsConn ? 'EN LIGNE ●' : 'HORS LIGNE ○'}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => router.push('/voice')} style={styles.voiceBtn}>
          <Text style={styles.voiceBtnTxt}>🎙 VOCAL</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={msgs}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.msgList}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <Bubble msg={item} />}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Typing indicator */}
      {thinking && (
        <View style={styles.typingRow}>
          <View style={styles.avatar2}>
            <Text style={styles.avatarLetter2}>D</Text>
          </View>
          <View style={styles.typingBubble}>
            <ActivityIndicator size="small" color="#00d4e8" />
          </View>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Écris un message..."
          placeholderTextColor="#ffffff33"
          style={[styles.input, { borderColor: input ? '#00d4e866' : '#00d4e822' }]}
          multiline
          maxLength={1000}
          onSubmitEditing={() => { if (!thinking) sendMessage(); }}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          onPress={sendMessage}
          disabled={!input.trim() || thinking}
          style={[
            styles.sendBtn,
            {
              backgroundColor: input.trim() && !thinking ? 'rgba(0,212,232,0.15)' : 'transparent',
              borderColor:      input.trim() && !thinking ? '#00d4e866' : '#ffffff22',
            },
          ]}
        >
          <Text style={{ color: input.trim() && !thinking ? '#00d4e8' : '#ffffff33', fontSize: 14 }}>
            ▶
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAi]}>
      {!isUser && (
        <View style={styles.avatar2}>
          <Text style={styles.avatarLetter2}>D</Text>
        </View>
      )}
      <View style={[
        styles.bubble,
        isUser ? styles.bubbleUser : styles.bubbleAi,
        msg.status === 'error' && styles.bubbleError,
      ]}>
        {msg.status === 'sending' && !msg.text ? (
          <ActivityIndicator size="small" color="#00d4e866" />
        ) : (
          <Text style={[styles.bubbleText, { color: isUser ? '#ffb347' : '#a8e8ff' }]}>
            {msg.text}
          </Text>
        )}
        <Text style={styles.bubbleTime}>{msg.ts}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#03050f',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderBottomWidth: 1, borderBottomColor: '#00d4e81a',
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  backBtn: { padding: 8, marginRight: 4 },
  backIcon: { color: '#00d4e888', fontSize: 24, lineHeight: 24 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,212,232,0.1)',
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { color: '#00d4e8', fontSize: 14, fontWeight: '700' },
  headerName: {
    color: '#00d4e8', fontSize: 10, fontWeight: '700', letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  headerStatus: {
    color: '#ffffff44', fontSize: 8, letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  voiceBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: '#00d4e833',
    backgroundColor: 'rgba(0,212,232,0.05)',
  },
  voiceBtnTxt: { color: '#00d4e888', fontSize: 9, letterSpacing: 1, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  msgList: { padding: 12, gap: 8, paddingBottom: 4 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 6 },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAi:  { justifyContent: 'flex-start' },
  avatar2: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,212,232,0.1)',
    borderWidth: 1, borderColor: '#00d4e844',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarLetter2: { color: '#00d4e8', fontSize: 10 },
  bubble: {
    maxWidth: '78%', padding: 10, borderRadius: 12,
  },
  bubbleUser: {
    backgroundColor: 'rgba(255,107,0,0.12)',
    borderWidth: 1, borderColor: '#ff6b0033',
    borderBottomRightRadius: 2,
  },
  bubbleAi: {
    backgroundColor: 'rgba(0,212,232,0.08)',
    borderWidth: 1, borderColor: '#00d4e822',
    borderBottomLeftRadius: 2,
  },
  bubbleError: { borderColor: '#ff336644', backgroundColor: 'rgba(255,51,102,0.08)' },
  bubbleText: { fontSize: 12, lineHeight: 20 },
  bubbleTime: { fontSize: 8, color: '#ffffff22', textAlign: 'right', marginTop: 3, letterSpacing: 0.5 },
  typingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 12, marginBottom: 4 },
  typingBubble: {
    padding: 12, borderRadius: 12,
    backgroundColor: 'rgba(0,212,232,0.06)',
    borderWidth: 1, borderColor: '#00d4e822',
  },
  inputRow: {
    flexDirection: 'row', gap: 8, padding: 10,
    borderTopWidth: 1, borderTopColor: '#00d4e81a',
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1, backgroundColor: 'rgba(0,212,232,0.05)',
    borderWidth: 1, borderRadius: 16,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
    color: '#fff', fontSize: 13, maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
});
