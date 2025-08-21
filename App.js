// App.js — SDK 53 — JS puro
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList, Share, Alert,
  TextInput, KeyboardAvoidingView, Platform, ScrollView, LayoutAnimation, UIManager
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import { THEMES as CLASSIC_THEMES } from "./src/themes";
import { Animated } from "react-native";

// Habilita animações no Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Utils
const uid = () => Math.random().toString(36).slice(2, 9);

// -------- Baralhos --------
// Você pode editar/expandir esses arrays à vontade.
// O deck "Clássico" usa o seu src/themes.js atual.
const DECKS_CATALOG = {
  "Clássico": CLASSIC_THEMES,
  "Nostalgia": [
    "Uma música que marcou seu ensino fundamental",
    "Uma música que tocava no churrasco da família",
    "Uma música que lembra seu primeiro celular com MP3",
    "Uma música do Orkut/MSN vibes",
  ],
  "Zoera": [
    "Uma música que ninguém esperaria você gostar",
    "Uma música que virou meme",
    "Uma música brega que é perfeita",
    "Uma música pra entrar na festa causando",
  ],
  "Anime & Geek": [
    "Abertura de anime que arrepia",
    "Tema de jogo que te marcou",
    "Uma trilha de filme/série que combina com heróis",
    "Uma música que você colocaria num boss fight",
  ],
  "Romance": [
    "Uma música para pedir em namoro",
    "Uma música que combina com dançar coladinho",
    "Uma música que lembra um crush",
    "Uma música perfeita para um date à noite",
  ],
  // “Personalizados” é preenchido pelo usuário em runtime
};

// ---------- App ----------
export default function App() {
  const [mode, setMode] = useState("home"); // "home" | "solo" | "lobby" | "theme" | "submit" | "vote" | "results"

  // SOLO
  const [current, setCurrent] = useState(null);
  const [stack, setStack] = useState([]);
  const [history, setHistory] = useState([]);
  const [used, setUsed] = useState(new Set());

  // MULTI
  const [players, setPlayers] = useState([]); // {id, name, score}
  const [newPlayer, setNewPlayer] = useState("");
  const [round, setRound] = useState(1);

  // Baralhos
  const [selectedDecks, setSelectedDecks] = useState(["Clássico"]);
  const [customThemes, setCustomThemes] = useState([]); // deck “Personalizados”
  const [newCustomTheme, setNewCustomTheme] = useState("");

  // Rodada
  const [roundTheme, setRoundTheme] = useState(null);
  const [submitIndex, setSubmitIndex] = useState(0);
  const [tempSong, setTempSong] = useState("");
  const [submissions, setSubmissions] = useState([]); // {playerId, song}
  const [voteIndex, setVoteIndex] = useState(0);
  const [votes, setVotes] = useState({}); // playerId -> votos

  // Animação do card de tema
  const themeOpacity = useRef(new Animated.Value(0)).current;
  const themeTranslate = useRef(new Animated.Value(20)).current;

  const animateThemeCard = () => {
    themeOpacity.setValue(0);
    themeTranslate.setValue(20);
    Animated.parallel([
      Animated.timing(themeOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(themeTranslate, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
  };

  // Lista de temas com base nos baralhos selecionados
  const allThemes = useMemo(() => {
    const union = [];
    const pushed = new Set();
    const catalogWithCustom = { ...DECKS_CATALOG, "Personalizados": customThemes };
    selectedDecks.forEach(deck => {
      const arr = catalogWithCustom[deck] || [];
      arr.forEach(t => {
        const key = `${deck}:${t}`;
        if (!pushed.has(key)) {
          union.push(t);
          pushed.add(key);
        }
      });
    });
    return union.filter(Boolean);
  }, [selectedDecks, customThemes]);

  // --------- SOLO ----------
  useEffect(() => {
    if (mode === "solo" && !current) handleNextSolo();
  }, [mode]);

  const pickRandomIndex = () => {
    if (used.size >= allThemes.length) setUsed(new Set());
    let idx = Math.floor(Math.random() * allThemes.length);
    let tries = 0;
    while (used.has(idx) && tries < 1000) {
      idx = Math.floor(Math.random() * allThemes.length);
      tries++;
    }
    return idx;
  };

  const handleNextSolo = () => {
    if (allThemes.length === 0) {
      Alert.alert("Sem temas!", "Selecione pelo menos um baralho no lobby ou adicione temas personalizados.");
      return;
    }
    const idx = pickRandomIndex();
    const next = allThemes[idx];
    if (current) setStack(s => [...s, current]);
    setCurrent(next);
    setHistory(h => [next, ...h].slice(0, 20));
    setUsed(prev => { const s = new Set(prev); s.add(idx); return s; });

    animateThemeCard();
  };

  const handleUndoSolo = () => {
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    setStack(s => s.slice(0, -1));
    setCurrent(prev);
    setHistory(h => [prev, ...h.filter((_, i) => i !== 0)].slice(0, 20));
    animateThemeCard();
  };

  const copySolo = async () => {
    if (!current) return;
    await Clipboard.setStringAsync(current);
    Alert.alert("Copiado!", "O tema foi copiado para a área de transferência.");
  };

  const shareSolo = async () => {
    if (!current) return;
    try { await Share.share({ message: `🎵 Tema do jogo: ${current}` }); }
    catch { Alert.alert("Ops!", "Não foi possível compartilhar agora."); }
  };

  // --------- MULTI ----------
  const startLobby = () => {
    setPlayers([]);
    setRound(1);
    setRoundTheme(null);
    setSubmitIndex(0);
    setTempSong("");
    setSubmissions([]);
    setVoteIndex(0);
    setVotes({});
    setMode("lobby");
  };

  const addPlayer = () => {
    const name = newPlayer.trim();
    if (!name) return;
    if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert("Ops", "Esse nome já foi adicionado.");
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPlayers(p => [...p, { id: uid(), name, score: 0 }]);
    setNewPlayer("");
  };

  const removePlayer = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPlayers(p => p.filter(x => x.id !== id));
  };

  const toggleDeck = (deck) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedDecks(prev => prev.includes(deck) ? prev.filter(d => d !== deck) : [...prev, deck]);
  };

  const addCustomTheme = () => {
    const t = newCustomTheme.trim();
    if (!t) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCustomThemes(arr => [...arr, t]);
    setNewCustomTheme("");
  };

  const canStart = players.length >= 2 && (allThemes.length > 0);

  const pickRoundTheme = () => {
    if (allThemes.length === 0) {
      Alert.alert("Sem temas!", "Selecione baralhos ou adicione temas personalizados.");
      return;
    }
    const t = allThemes[Math.floor(Math.random() * allThemes.length)];
    setRoundTheme(t);
    animateThemeCard();
  };

  const goToTheme = () => {
    if (!canStart) {
      Alert.alert("Configuração insuficiente", "Adicione pelo menos 2 jogadores e selecione/adicione temas.");
      return;
    }
    pickRoundTheme();
    setMode("theme");
  };

  const skipTheme = () => pickRoundTheme();

  const goToSubmit = () => {
    setSubmissions([]);
    setSubmitIndex(0);
    setTempSong("");
    setMode("submit");
  };

  const saveSubmission = () => {
    const song = tempSong.trim();
    if (!song) return Alert.alert("Digite o nome da música!");
    const player = players[submitIndex];
    if (submissions.find(s => s.playerId === player.id)) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSubmissions(s => [...s, { playerId: player.id, song }]);
    setTempSong("");

    if (submitIndex + 1 < players.length) {
      setSubmitIndex(i => i + 1);
    } else {
      // preparar votos
      const base = {};
      players.forEach(p => { base[p.id] = 0; });
      setVotes(base);
      setVoteIndex(0);
      setMode("vote");
    }
  };

  const currentVoter = players[voteIndex];
  const optionsForVoter = submissions.filter(s => s.playerId !== (currentVoter && currentVoter.id));

  const castVote = (targetPlayerId) => {
    if (!currentVoter) return;
    if (targetPlayerId === currentVoter.id) return Alert.alert("Não vale votar em si 😉");

    setVotes(v => ({ ...v, [targetPlayerId]: (v[targetPlayerId] || 0) + 1 }));

    if (voteIndex + 1 < players.length) {
      setVoteIndex(i => i + 1);
    } else {
      // fim das votações -> aplicar pontuação
      setPlayers(prev => prev.map(p => ({ ...p, score: p.score + (votes[p.id] || 0) })));
      setMode("results");
    }
  };

  const nextRound = () => {
    setRound(r => r + 1);
    setRoundTheme(null);
    setSubmitIndex(0);
    setTempSong("");
    setSubmissions([]);
    setVoteIndex(0);
    setVotes({});
    pickRoundTheme();
    setMode("theme");
  };

  const endGame = () => {
    Alert.alert("Fim de jogo!", "Quer voltar ao início?", [
      { text: "Home", onPress: () => setMode("home") },
      { text: "Continuar jogando", onPress: nextRound }
    ]);
  };

  // --------- RENDER ---------
  if (mode === "home") {
    return (
      <Screen>
        <Title>Party Game: Temas Musicais</Title>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Escolha um modo</Text>
          <PrimaryButton label="🎲 Modo Solo" onPress={() => { setMode("solo"); setTimeout(animateThemeCard, 10); }} />
          <PrimaryButton label="🧑‍🤝‍🧑 Multiplayer (local)" onPress={startLobby} />
        </View>
        <Footer />
      </Screen>
    );
  }

  if (mode === "solo") {
    return (
      <Screen>
        <Title>Modo Solo</Title>
        <Animated.View style={[styles.card, { opacity: themeOpacity, transform: [{ translateY: themeTranslate }] }]}>
          <Text style={styles.cardLabel}>Tema da vez</Text>
          <Text style={styles.theme}>{current || "Toque em 'Novo tema' 👇"}</Text>
        </Animated.View>
        <Row>
          <PrimaryButton label="Novo tema" onPress={handleNextSolo} />
          <GhostButton label="Desfazer" onPress={handleUndoSolo} disabled={stack.length === 0} />
        </Row>
        <Row>
          <GhostButton label="Copiar" onPress={copySolo} disabled={!current} />
          <GhostButton label="Compartilhar" onPress={shareSolo} disabled={!current} />
        </Row>
        <Text style={styles.historyTitle}>Histórico (últimos 20)</Text>
        <FlatList
          data={history}
          keyExtractor={(item, index) => `${item}-${index}`}
          renderItem={({ item, index }) => (
            <View style={styles.historyItem}>
              <Text style={styles.historyIndex}>{index + 1}.</Text>
              <Text style={styles.historyText}>{item}</Text>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
        <Row><GhostButton label="⬅️ Voltar" onPress={() => setMode("home")} /></Row>
        <Footer />
      </Screen>
    );
  }

  if (mode === "lobby") {
    const catalog = { ...DECKS_CATALOG, "Personalizados": customThemes };
    const deckNames = Object.keys(catalog);

    return (
      <Screen>
        <Title>Multiplayer — Lobby</Title>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Adicione jogadores</Text>
          <Row>
            <TextInput
              placeholder="Nome do jogador"
              placeholderTextColor="#7b7b92"
              value={newPlayer}
              onChangeText={setNewPlayer}
              style={styles.input}
            />
            <PrimaryButton label="Adicionar" onPress={addPlayer} />
          </Row>
          {players.length === 0 && <Text style={styles.muted}>Ninguém ainda…</Text>}
          {players.map((p) => (
            <Row key={p.id} style={{ marginTop: 8, alignItems: "center" }}>
              <Text style={{ color: "#EDEDF7", flex: 1 }}>{p.name}</Text>
              <GhostButton label="Remover" onPress={() => removePlayer(p.id)} />
            </Row>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Baralhos de temas (marque os que quiser)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {deckNames.map((d) => {
              const active = selectedDecks.includes(d);
              return (
                <TouchableOpacity key={d} style={[styles.deckChip, active && styles.deckChipActive]} onPress={() => toggleDeck(d)}>
                  <Text style={[styles.deckChipText, active && styles.deckChipTextActive]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.cardLabel, { marginTop: 16 }]}>Adicionar seu próprio tema</Text>
          <Row>
            <TextInput
              placeholder="Digite um novo tema"
              placeholderTextColor="#7b7b92"
              value={newCustomTheme}
              onChangeText={setNewCustomTheme}
              style={styles.input}
            />
            <PrimaryButton label="Adicionar" onPress={addCustomTheme} />
          </Row>
          {customThemes.length > 0 && (
            <>
              <Text style={[styles.muted, { marginTop: 10 }]}>Personalizados ({customThemes.length})</Text>
              <FlatList
                data={customThemes}
                keyExtractor={(item, i) => item + i}
                renderItem={({ item }) => <Text style={{ color: "#EDEDF7", marginTop: 6 }}>• {item}</Text>}
                style={{ maxHeight: 120, marginTop: 6 }}
              />
            </>
          )}
        </View>

        <Row>
          <PrimaryButton label="Começar rodada" onPress={goToTheme} disabled={!canStart} />
          <GhostButton label="⬅️ Voltar" onPress={() => setMode("home")} />
        </Row>
        <Footer />
      </Screen>
    );
  }

  if (mode === "theme") {
    return (
      <Screen>
        <Title>Rodada {round}</Title>
        <Animated.View style={[styles.card, { opacity: themeOpacity, transform: [{ translateY: themeTranslate }] }]}>
          <Text style={styles.cardLabel}>Tema sorteado</Text>
          <Text style={styles.theme}>{roundTheme}</Text>
        </Animated.View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Quer sugerir outro tema na hora?</Text>
          <Row>
            <TextInput
              placeholder="Digite um tema e adicione"
              placeholderTextColor="#7b7b92"
              value={newCustomTheme}
              onChangeText={setNewCustomTheme}
              style={styles.input}
            />
            <GhostButton label="Adicionar" onPress={addCustomTheme} />
          </Row>
          <Text style={styles.muted}>Dica: temas adicionados entram no baralho “Personalizados”.</Text>
        </View>

        <Row>
          <PrimaryButton label="Trocar tema" onPress={skipTheme} />
          <PrimaryButton label="Começar envios" onPress={goToSubmit} />
        </Row>
        <Scoreboard players={players} />
        <Row><GhostButton label="Encerrar jogo" onPress={endGame} /></Row>
        <Footer />
      </Screen>
    );
  }

  if (mode === "submit") {
    const p = players[submitIndex];
    return (
      <Screen>
        <Title>Envios — Rodada {round}</Title>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Jogador</Text>
          <Text style={styles.theme}>{p.name}</Text>
          <Text style={[styles.cardLabel, { marginTop: 16 }]}>Tema</Text>
          <Text style={styles.historyText}>{roundTheme}</Text>
          <TextInput
            placeholder="Nome da música (ex.: Artista - Música)"
            placeholderTextColor="#7b7b92"
            value={tempSong}
            onChangeText={setTempSong}
            style={[styles.input, { marginTop: 16 }]}
          />
          <PrimaryButton label="Enviar" onPress={saveSubmission} />
          <Text style={styles.muted}>Dica: passa o celular de mão em mão 😉</Text>
        </View>
        <Footer />
      </Screen>
    );
  }

  if (mode === "vote") {
    const voter = currentVoter;
    return (
      <Screen>
        <Title>Votação — Rodada {round}</Title>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Quem vota agora</Text>
          <Text style={styles.theme}>{voter && voter.name}</Text>
          <Text style={[styles.cardLabel, { marginTop: 16 }]}>Escolha a melhor resposta ao tema:</Text>
          <ScrollView style={{ maxHeight: 260, marginTop: 8 }}>
            {optionsForVoter.map((s) => {
              const player = players.find((p) => p.id === s.playerId);
              return (
                <TouchableOpacity key={s.playerId} style={styles.voteItem} onPress={() => castVote(s.playerId)}>
                  <Text style={{ color: "#EDEDF7", fontWeight: "700" }}>{player ? player.name : "?"}</Text>
                  <Text style={{ color: "#BDBDDE", marginTop: 4 }}>{s.song}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={styles.muted}>Ninguém pode votar em si mesmo.</Text>
        </View>
        <Footer />
      </Screen>
    );
  }

  if (mode === "results") {
    const roundVotes = Object.entries(votes).sort((a, b) => (b[1] || 0) - (a[1] || 0));
    return (
      <Screen>
        <Title>Resultado da Rodada {round}</Title>
        <View style={styles.card}>
          {roundVotes.length === 0 && <Text style={styles.muted}>Sem votos</Text>}
          {roundVotes.map(([pid, v]) => {
            const player = players.find((p) => p.id === pid);
            const sub = submissions.find((s) => s.playerId === pid);
            return (
              <View key={pid} style={{ marginBottom: 12 }}>
                <Text style={{ color: "#EDEDF7", fontWeight: "700" }}>
                  {(player && player.name) || "?"} — {v} voto(s)
                </Text>
                <Text style={{ color: "#BDBDDE" }}>{sub && sub.song}</Text>
              </View>
            );
          })}
        </View>
        <Scoreboard players={players} />
        <Row>
          <PrimaryButton label="Próxima rodada" onPress={nextRound} />
          <GhostButton label="Encerrar jogo" onPress={endGame} />
        </Row>
        <Footer />
      </Screen>
    );
  }

  return null;
}

// ---------- UI helpers ----------
function Screen({ children }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
      <StatusBar style="light" />
      {children}
    </KeyboardAvoidingView>
  );
}
function Title({ children }) {
  return <Text style={styles.title}>{children}</Text>;
}
function Row({ children, style: st }) {
  return <View style={[{ flexDirection: "row", marginBottom: 10, flexWrap: "wrap" }, st]}>{children}</View>;
}
function Footer() {
  return <Text style={styles.footer}>Feito com ❤️ no Expo</Text>;
}
function PrimaryButton({ label, onPress, disabled }) {
  return (
    <TouchableOpacity style={[styles.primaryBtn, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}
function GhostButton({ label, onPress, disabled }) {
  return (
    <TouchableOpacity style={[styles.ghostBtn, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      <Text style={[styles.ghostBtnText, disabled && styles.disabledText]}>{label}</Text>
    </TouchableOpacity>
  );
}
function Scoreboard({ players }) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  return (
    <>
      <Text style={styles.historyTitle}>Placar geral</Text>
      {ranked.map((p, i) => (
        <View key={p.id} style={[styles.historyItem, { alignItems: "center" }]}>
          <Text style={styles.historyIndex}>{i + 1}.</Text>
          <Text style={styles.historyText}>{p.name}</Text>
          <Text style={{ color: "#B4B4FF", fontWeight: "700" }}>{p.score} pts</Text>
        </View>
      ))}
    </>
  );
}

// ---------- Estilos ----------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0B0F", paddingTop: 64, paddingHorizontal: 20 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "700", textAlign: "center", marginBottom: 24 },
  card: { backgroundColor: "#15151E", borderRadius: 16, padding: 24, marginVertical: 20, borderWidth: 1, borderColor: "#26263A" },
  cardLabel: { color: "#8A8AA3", fontSize: 13, marginBottom: 10 },
  theme: { color: "#FFFFFF", fontSize: 22, lineHeight: 30, fontWeight: "600" },
  primaryBtn: { backgroundColor: "#6C5CE7", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, marginRight: 12, marginVertical: 6 },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  ghostBtn: { borderColor: "#6C5CE7", borderWidth: 1, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, marginRight: 12, marginVertical: 6 },
  ghostBtnText: { color: "#B4B4FF", fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.4, borderColor: "#444" },
  disabledText: { color: "#777" },
  historyTitle: { color: "#8A8AA3", marginTop: 20, marginBottom: 10, fontSize: 15, fontWeight: "600" },
  historyItem: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1F1F2D", alignItems: "center" },
  historyIndex: { color: "#6C5CE7", width: 24, textAlign: "right", fontWeight: "700", marginRight: 10 },
  historyText: { color: "#EDEDF7", flex: 1, fontSize: 15 },
  footer: { color: "#4A4A65", textAlign: "center", marginTop: 24, marginBottom: 10 },
  input: { flex: 1, backgroundColor: "#0F0F18", borderColor: "#26263A", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: "#EDEDF7", fontSize: 16, minHeight: 50 },
  voteItem: { borderWidth: 1, borderColor: "#26263A", borderRadius: 12, padding: 16, marginBottom: 14, backgroundColor: "#171726" },
  deckChip: { borderWidth: 1, borderColor: "#2A2A40", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, marginRight: 8, marginBottom: 10, backgroundColor: "#10101A" },
  deckChipActive: { borderColor: "#6C5CE7", backgroundColor: "#1A1830" },
  deckChipText: { color: "#BDBDDE", fontSize: 14 },
  deckChipTextActive: { color: "#EDEDF7", fontWeight: "700" },
  muted: { color: "#7b7b92", fontSize: 13, marginTop: 8 }
});
