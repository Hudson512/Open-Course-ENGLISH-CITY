// UI strings. The game itself (NPCs) is always in English; the interface follows the learner's language.
const STR = {
  pt: {
    tagline: 'Aprende inglês a viver na América.',
    newGame: 'Novo jogo', continue: 'Continuar', settings: 'Definições',
    createTitle: 'Check-in do passageiro', name: 'Nome', homeCity: 'Cidade natal (aeroporto de partida)',
    nativeLang: 'Língua materna', profession: 'Profissão', professionDetail: 'Detalhe (opcional, ex: "enfermeira pediátrica")',
    nextBoard: 'Ir para o painel de partidas →', departures: 'Partidas', destination: 'Destino', language: 'Língua', status: 'Estado',
    boarding: 'EMBARQUE', soon: 'EM BREVE', flyTo: 'Embarcar', flying: 'A voar para', landing: 'A aterrar em Maple City…',
    health: 'Saúde', hunger: 'Fome', energy: 'Energia', social: 'Social', day: 'Dia',
    press: 'E', enter: 'Entrar', talk: 'Falar com', missions: 'Missões', story: 'História', daily: 'Diárias', track: 'Seguir',
    tracking: 'A seguir', inventory: 'Inventário', notebook: 'Caderno', phone: 'Telemóvel', eat: 'Comer', empty: 'Vazio',
    send: 'Enviar', leave: 'Sair', hint: 'Dicas', translate: 'Tradução', thinking: 'a pensar…', typeHere: 'Escreve em inglês…',
    missionComplete: 'Missão concluída!', levelUp: 'Subiste de nível!', sleep: 'Dormir', home: 'Casa',
    noHome: 'Ainda não tens casa.', sleepNow: 'Dormir até às 7:00', freeTalk: 'Conversar / comprar', workShift: 'Começar turno de trabalho',
    startMission: 'Começar', locked: 'Bloqueado', reqMissing: 'Requisitos em falta',
    req_level_a2: 'nível A2', req_home: 'morada', req_phone: 'telefone', req_bank: 'conta bancária', req_tomorrow: 'tenta amanhã', req_already_employed: 'já tens emprego', req_no_job: 'sem emprego', req_already_worked: 'já trabalhaste hoje',
    taxi: 'Chamar táxi', taxiNeedsPhone: 'Precisas de um telefone americano para chamar táxi.', taxiCost: 'Custo',
    review: 'Rever palavras', knew: 'Sabia ✓', notYet: 'Ainda não', reveal: 'Mostrar', noWords: 'Ainda não tens palavras. Conversa com pessoas!',
    chatHint: 'Enter para falar com jogadores perto de ti', online: 'online', offline: 'offline',
    fainted: 'Desmaiaste! Acordaste na clínica. Conta do hospital:', evicted: 'Não conseguiste pagar a renda. Perdeste a casa!', rentPaid: 'Renda paga',
    gameOver: 'Fim de jogo', gameOverText: 'Desmaiaste demasiadas vezes e tiveste de voltar para casa.', restart: 'Recomeçar',
    providerTitle: 'Inteligência artificial dos NPCs', provider: 'Provedor', apiKey: 'API key', model: 'Modelo', baseUrl: 'URL base',
    keyNote: 'A tua chave fica só no teu browser e é enviada apenas ao servidor local do jogo, que a usa para falar com o provedor.',
    test: 'Testar ligação', save: 'Guardar', voice: 'Voz dos NPCs (text-to-speech)', mic: 'Microfone (falar em inglês)', uiLang: 'Língua da interface',
    showTranslation: 'Mostrar tradução automaticamente (A1/A2)', checkChat: 'Corrigir o meu inglês no chat com jogadores',
    close: 'Fechar', welcome: 'Bem-vindo a Maple City! Vai até à praça de táxis (seta amarela) e carrega E.',
    arrivedAt: 'Chegaste a', enterToCheckin: 'Carrega E na porta para fazer o check-in.',
    storyDone: 'História principal concluída! Continua a trabalhar, poupar e subir de nível.',
    hired: 'Foste contratado(a)!', paid: 'Recebeste', rejected: 'Não foste aprovado(a) desta vez. Tenta amanhã.',
    payFail: 'Pagamento recusado: dinheiro insuficiente.', carHit: 'Cuidado com os carros!', controls: 'WASD/setas: andar · Shift: correr · E: interagir · Enter: chat · M: missões · I: inventário · N: caderno · P: telemóvel',
    lowHunger: 'Estás com fome! Compra comida.', lowEnergy: 'Estás exausto(a). Vai dormir.', lowSocial: 'Sentes-te sozinho(a). Conversa com alguém.',
    newDay: 'Novo dia', resetSave: 'Apagar progresso', confirmReset: 'Apagar todo o progresso?', you: 'Tu', alreadyChatted: 'Já conversaste com esta pessoa hoje.'
  },
  en: {
    tagline: 'Learn English by living in America.',
    newGame: 'New game', continue: 'Continue', settings: 'Settings',
    createTitle: 'Passenger check-in', name: 'Name', homeCity: 'Home city (departure airport)',
    nativeLang: 'Native language', profession: 'Profession', professionDetail: 'Detail (optional, e.g. "pediatric nurse")',
    nextBoard: 'Go to departures board →', departures: 'Departures', destination: 'Destination', language: 'Language', status: 'Status',
    boarding: 'BOARDING', soon: 'SOON', flyTo: 'Board', flying: 'Flying to', landing: 'Landing in Maple City…',
    health: 'Health', hunger: 'Hunger', energy: 'Energy', social: 'Social', day: 'Day',
    press: 'E', enter: 'Enter', talk: 'Talk to', missions: 'Missions', story: 'Story', daily: 'Daily', track: 'Track',
    tracking: 'Tracking', inventory: 'Inventory', notebook: 'Notebook', phone: 'Phone', eat: 'Eat', empty: 'Empty',
    send: 'Send', leave: 'Leave', hint: 'Hints', translate: 'Translation', thinking: 'thinking…', typeHere: 'Type in English…',
    missionComplete: 'Mission complete!', levelUp: 'Level up!', sleep: 'Sleep', home: 'Home',
    noHome: 'You have no home yet.', sleepNow: 'Sleep until 7:00', freeTalk: 'Chat / buy', workShift: 'Start work shift',
    startMission: 'Start', locked: 'Locked', reqMissing: 'Missing requirements',
    req_level_a2: 'level A2', req_home: 'address', req_phone: 'phone', req_bank: 'bank account', req_tomorrow: 'try tomorrow', req_already_employed: 'already employed', req_no_job: 'no job', req_already_worked: 'already worked today',
    taxi: 'Call a taxi', taxiNeedsPhone: 'You need a US phone to call a taxi.', taxiCost: 'Cost',
    review: 'Review words', knew: 'Knew it ✓', notYet: 'Not yet', reveal: 'Reveal', noWords: 'No words yet. Go talk to people!',
    chatHint: 'Enter to talk to players near you', online: 'online', offline: 'offline',
    fainted: 'You fainted! You woke up at the clinic. Hospital bill:', evicted: 'You could not pay rent. You lost your home!', rentPaid: 'Rent paid',
    gameOver: 'Game over', gameOverText: 'You fainted too many times and had to fly back home.', restart: 'Restart',
    providerTitle: 'NPC artificial intelligence', provider: 'Provider', apiKey: 'API key', model: 'Model', baseUrl: 'Base URL',
    keyNote: 'Your key stays in your browser and is only sent to the local game server, which uses it to talk to the provider.',
    test: 'Test connection', save: 'Save', voice: 'NPC voice (text-to-speech)', mic: 'Microphone (speak English)', uiLang: 'Interface language',
    showTranslation: 'Show translation automatically (A1/A2)', checkChat: 'Check my English in player chat',
    close: 'Close', welcome: 'Welcome to Maple City! Walk to the taxi stand (yellow arrow) and press E.',
    arrivedAt: 'You arrived at', enterToCheckin: 'Press E at the door to check in.',
    storyDone: 'Main story complete! Keep working, saving and leveling up.',
    hired: 'You got the job!', paid: 'You earned', rejected: 'Not approved this time. Try again tomorrow.',
    payFail: 'Payment declined: not enough money.', carHit: 'Watch out for cars!', controls: 'WASD/arrows: walk · Shift: run · E: interact · Enter: chat · M: missions · I: inventory · N: notebook · P: phone',
    lowHunger: 'You are hungry! Buy food.', lowEnergy: 'You are exhausted. Go to sleep.', lowSocial: 'You feel lonely. Talk to someone.',
    newDay: 'New day', resetSave: 'Delete progress', confirmReset: 'Delete all progress?', you: 'You', alreadyChatted: 'You already chatted with this person today.'
  }
};

let lang = 'pt';
export function setLang(l) { lang = STR[l] ? l : 'en'; }
export function getLang() { return lang; }
export function t(key) { return STR[lang][key] ?? STR.en[key] ?? key; }
export function tr(obj) { return obj ? obj[lang] || obj.en : ''; } // pick from {en, pt}
