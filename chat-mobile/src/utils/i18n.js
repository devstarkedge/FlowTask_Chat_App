import { usePreferencesStore } from '../stores/preferencesStore';

const translations = {
  'English (US)': {
    Home: 'Home', DMs: 'DMs', Activity: 'Activity', Later: 'Later', More: 'More',
    You: 'You', Active: 'Active', 'What\'s your status?': 'What\'s your status?', 'Pause notifications': 'Pause notifications',
    'Set yourself as away': 'Set yourself as away', 'Invite members': 'Invite members', 'View profile': 'View profile',
    Preferences: 'Preferences', 'Sign out': 'Sign out', 'Catch Up': 'Catch Up', 'Threads': 'Threads',
    'Huddles': 'Huddles', 'Drafts': 'Drafts', 'Scheduled': 'Scheduled', 'Unread': 'Unread',
    'Direct Messages': 'Direct Messages', 'Channels': 'Channels', 'Jump to...': 'Jump to...',
    'Language': 'Language', 'Swipe Actions': 'Swipe Actions', 'Time Format': 'Time Format', 'Emoji Skin Tone': 'Emoji Skin Tone',
    'Notifications': 'Notifications',
  },
  'English (UK)': {
    Home: 'Home', DMs: 'DMs', Activity: 'Activity', Later: 'Later', More: 'More',
    You: 'You', Active: 'Active', 'What\'s your status?': 'What\'s your status?', 'Pause notifications': 'Pause notifications',
    'Set yourself as away': 'Set yourself as away', 'Invite members': 'Invite members', 'View profile': 'View profile',
    Preferences: 'Preferences', 'Sign out': 'Sign out', 'Catch Up': 'Catch Up', 'Threads': 'Threads',
    'Huddles': 'Huddles', 'Drafts': 'Drafts', 'Scheduled': 'Scheduled', 'Unread': 'Unread',
    'Direct Messages': 'Direct Messages', 'Channels': 'Channels', 'Jump to...': 'Jump to...',
    'Language': 'Language', 'Swipe Actions': 'Swipe Actions', 'Time Format': 'Time Format', 'Emoji Skin Tone': 'Emoji Skin Tone',
    'Notifications': 'Notifications',
  },
  'Español (España)': {
    Home: 'Inicio', DMs: 'MDs', Activity: 'Actividad', Later: 'Más tarde', More: 'Más',
    You: 'Tú', Active: 'Activo', 'What\'s your status?': '¿Cuál es tu estado?', 'Pause notifications': 'Pausar notificaciones',
    'Set yourself as away': 'Ponerse como ausente', 'Invite members': 'Invitar miembros', 'View profile': 'Ver perfil',
    Preferences: 'Preferencias', 'Sign out': 'Cerrar sesión', 'Catch Up': 'Ponerse al día', 'Threads': 'Hilos',
    'Huddles': 'Reuniones', 'Drafts': 'Borradores', 'Scheduled': 'Programados', 'Unread': 'No leídos',
    'Direct Messages': 'Mensajes Directos', 'Channels': 'Canales', 'Jump to...': 'Ir a...',
    'Language': 'Idioma', 'Swipe Actions': 'Acciones de deslizamiento', 'Time Format': 'Formato de hora', 'Emoji Skin Tone': 'Tono de piel de Emoji',
    'Notifications': 'Notificaciones',
  },
  'Español (Latinoamérica)': {
    Home: 'Inicio', DMs: 'MDs', Activity: 'Actividad', Later: 'Más tarde', More: 'Más',
    You: 'Tú', Active: 'Activo', 'What\'s your status?': '¿Cuál es tu estado?', 'Pause notifications': 'Pausar notificaciones',
    'Set yourself as away': 'Ponerse como ausente', 'Invite members': 'Invitar miembros', 'View profile': 'Ver perfil',
    Preferences: 'Preferencias', 'Sign out': 'Cerrar sesión', 'Catch Up': 'Ponerse al día', 'Threads': 'Hilos',
    'Huddles': 'Reuniones', 'Drafts': 'Borradores', 'Scheduled': 'Programados', 'Unread': 'No leídos',
    'Direct Messages': 'Mensajes Directos', 'Channels': 'Canales', 'Jump to...': 'Ir a...',
    'Language': 'Idioma', 'Swipe Actions': 'Acciones de deslizamiento', 'Time Format': 'Formato de hora', 'Emoji Skin Tone': 'Tono de piel de Emoji',
    'Notifications': 'Notificaciones',
  },
  'Français (France)': {
    Home: 'Accueil', DMs: 'MP', Activity: 'Activité', Later: 'Plus tard', More: 'Plus',
    You: 'Vous', Active: 'Actif', 'What\'s your status?': 'Quel est votre statut ?', 'Pause notifications': 'Mettre les notifications en pause',
    'Set yourself as away': 'Se définir comme absent', 'Invite members': 'Inviter des membres', 'View profile': 'Voir le profil',
    Preferences: 'Préférences', 'Sign out': 'Se déconnecter', 'Catch Up': 'Rattraper', 'Threads': 'Fils',
    'Huddles': 'Appels', 'Drafts': 'Brouillons', 'Scheduled': 'Programmés', 'Unread': 'Non lus',
    'Direct Messages': 'Messages Directs', 'Channels': 'Canaux', 'Jump to...': 'Aller à...',
    'Language': 'Langue', 'Swipe Actions': 'Actions de balayage', 'Time Format': 'Format de l\'heure', 'Emoji Skin Tone': 'Teint des Emoji',
    'Notifications': 'Notifications',
  },
  'Deutsch (Deutschland)': {
    Home: 'Startseite', DMs: 'DMs', Activity: 'Aktivität', Later: 'Später', More: 'Mehr',
    You: 'Du', Active: 'Aktiv', 'What\'s your status?': 'Was ist dein Status?', 'Pause notifications': 'Benachrichtigungen pausieren',
    'Set yourself as away': 'Als abwesend festlegen', 'Invite members': 'Mitglieder einladen', 'View profile': 'Profil ansehen',
    Preferences: 'Einstellungen', 'Sign out': 'Abmelden', 'Catch Up': 'Aufholen', 'Threads': 'Threads',
    'Huddles': 'Huddles', 'Drafts': 'Entwürfe', 'Scheduled': 'Geplant', 'Unread': 'Ungelesen',
    'Direct Messages': 'Direktnachrichten', 'Channels': 'Kanäle', 'Jump to...': 'Gehe zu...',
    'Language': 'Sprache', 'Swipe Actions': 'Wischaktionen', 'Time Format': 'Zeitformat', 'Emoji Skin Tone': 'Emoji-Hautton',
    'Notifications': 'Benachrichtigungen',
  },
  'Italiano (Italia)': {
    Home: 'Home', DMs: 'DM', Activity: 'Attività', Later: 'Più tardi', More: 'Altro',
    You: 'Tu', Active: 'Attivo', 'What\'s your status?': 'Qual è il tuo stato?', 'Pause notifications': 'Pausa notifiche',
    'Set yourself as away': 'Imposta come assente', 'Invite members': 'Invita membri', 'View profile': 'Vedi profilo',
    Preferences: 'Preferenze', 'Sign out': 'Esci', 'Catch Up': 'Resta al passo', 'Threads': 'Discussioni',
    'Huddles': 'Chiamate', 'Drafts': 'Bozze', 'Scheduled': 'Programmati', 'Unread': 'Non letti',
    'Direct Messages': 'Messaggi Diretti', 'Channels': 'Canali', 'Jump to...': 'Vai a...',
    'Language': 'Lingua', 'Swipe Actions': 'Azioni di scorrimento', 'Time Format': 'Formato ora', 'Emoji Skin Tone': 'Colore pelle Emoji',
    'Notifications': 'Notifiche',
  },
  'Português (Brasil)': {
    Home: 'Início', DMs: 'MDs', Activity: 'Atividade', Later: 'Mais tarde', More: 'Mais',
    You: 'Você', Active: 'Ativo', 'What\'s your status?': 'Qual é o seu status?', 'Pause notifications': 'Pausar notificações',
    'Set yourself as away': 'Definir como ausente', 'Invite members': 'Convidar membros', 'View profile': 'Ver perfil',
    Preferences: 'Preferências', 'Sign out': 'Sair', 'Catch Up': 'Ficar em dia', 'Threads': 'Tópicos',
    'Huddles': 'Reuniões', 'Drafts': 'Rascunhos', 'Scheduled': 'Agendados', 'Unread': 'Não lidos',
    'Direct Messages': 'Mensagens Diretas', 'Channels': 'Canais', 'Jump to...': 'Ir para...',
    'Language': 'Idioma', 'Swipe Actions': 'Ações de deslizar', 'Time Format': 'Formato de hora', 'Emoji Skin Tone': 'Tom de pele do Emoji',
    'Notifications': 'Notificações',
  },
  '日本語': {
    Home: 'ホーム', DMs: 'DM', Activity: 'アクティビティ', Later: '後で', More: 'その他',
    You: 'あなた', Active: 'アクティブ', 'What\'s your status?': 'ステータスは何ですか？', 'Pause notifications': '通知を一時停止',
    'Set yourself as away': '離席中に設定', 'Invite members': 'メンバーを招待', 'View profile': 'プロフィールを見る',
    Preferences: '環境設定', 'Sign out': 'サインアウト', 'Catch Up': 'キャッチアップ', 'Threads': 'スレッド',
    'Huddles': 'ハドル', 'Drafts': '下書き', 'Scheduled': 'スケジュール済み', 'Unread': '未読',
    'Direct Messages': 'ダイレクトメッセージ', 'Channels': 'チャンネル', 'Jump to...': '移動...',
    'Language': '言語', 'Swipe Actions': 'スワイプアクション', 'Time Format': '時間フォーマット', 'Emoji Skin Tone': '絵文字のスキントーン',
    'Notifications': '通知',
  },
  '한국어': {
    Home: '홈', DMs: 'DM', Activity: '활동', Later: '나중에', More: '더보기',
    You: '나', Active: '활성', 'What\'s your status?': '상태를 설정하세요', 'Pause notifications': '알림 일시 중지',
    'Set yourself as away': '자리 비움으로 설정', 'Invite members 멤버 초대': '멤버 초대', 'View profile': '프로필 보기',
    Preferences: '환경설정', 'Sign out': '로그아웃', 'Catch Up': '밀린 작업', 'Threads': '스레드',
    'Huddles': '허들', 'Drafts': '임시보관함', 'Scheduled': '예약됨', 'Unread': '읽지 않음',
    'Direct Messages': '다이렉트 메시지', 'Channels': '채널', 'Jump to...': '이동...',
    'Language': '언어', 'Swipe Actions': '스와이프 작업', 'Time Format': '시간 형식', 'Emoji Skin Tone': '이모지 피부색',
    'Notifications': '알림',
  },
  '简体中文': {
    Home: '首页', DMs: '私信', Activity: '活动', Later: '稍后', More: '更多',
    You: '你', Active: '在线', 'What\'s your status?': '你的状态是什么？', 'Pause notifications': '暂停通知',
    'Set yourself as away': '设置为离开', 'Invite members': '邀请成员', 'View profile': '查看个人资料',
    Preferences: '偏好设置', 'Sign out': '退出', 'Catch Up': '跟进', 'Threads': '主题',
    'Huddles': '语音', 'Drafts': '草稿', 'Scheduled': '已安排', 'Unread': '未读',
    'Direct Messages': '私信', 'Channels': '频道', 'Jump to...': '跳转到...',
    'Language': '语言', 'Swipe Actions': '滑动操作', 'Time Format': '时间格式', 'Emoji Skin Tone': '表情肤色',
    'Notifications': '通知',
  },
  '繁體中文': {
    Home: '首頁', DMs: '私訊', Activity: '活動', Later: '稍後', More: '更多',
    You: '你', Active: '上線', 'What\'s your status?': '你的狀態是什麼？', 'Pause notifications': '暫停通知',
    'Set yourself as away': '設定為離開', 'Invite members': '邀請成員', 'View profile': '查看個人資料',
    Preferences: '偏好設定', 'Sign out': '登出', 'Catch Up': '跟進', 'Threads': '主題',
    'Huddles': '語音', 'Drafts': '草稿', 'Scheduled': '已安排', 'Unread': '未讀',
    'Direct Messages': '私訊', 'Channels': '頻道', 'Jump to...': '跳轉到...',
    'Language': '語言', 'Swipe Actions': '滑動操作', 'Time Format': '時間格式', 'Emoji Skin Tone': '表情膚色',
    'Notifications': '通知',
  }
};

export const useTranslation = () => {
  const { language } = usePreferencesStore();

  const t = (key) => {
    const dict = translations[language] || translations['English (US)'];
    return dict[key] || key;
  };

  return { t };
};
