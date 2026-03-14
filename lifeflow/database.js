const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs   = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'lifeflow.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    bio         TEXT DEFAULT '',
    avatar_url  TEXT DEFAULT '',
    is_official INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#264478'
  );

  CREATE TABLE IF NOT EXISTS timeline_entries (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    detail     TEXT DEFAULT '',
    image_url  TEXT DEFAULT '',
    entry_date TEXT NOT NULL,
    visibility TEXT DEFAULT 'public'
               CHECK(visibility IN ('public','users','followers','specific')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entry_tags (
    entry_id TEXT    NOT NULL REFERENCES timeline_entries(id) ON DELETE CASCADE,
    tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (follower_id, following_id)
  );

  CREATE TABLE IF NOT EXISTS entry_specific_viewers (
    entry_id TEXT NOT NULL REFERENCES timeline_entries(id) ON DELETE CASCADE,
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, user_id)
  );
`);

// 既存 DB への is_official カラム追加（マイグレーション）
try { db.exec('ALTER TABLE users ADD COLUMN is_official INTEGER DEFAULT 0'); } catch {}

// ===== デフォルトタグ =====
const seedTag = db.prepare('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)');
db.transaction(() => {
  seedTag.run('仕事',   '#264478');
  seedTag.run('家族',   '#b5496a');
  seedTag.run('旅行',   '#2a7f62');
  seedTag.run('学業',   '#5c4494');
  seedTag.run('健康',   '#9b4425');
  seedTag.run('趣味',   '#3a7a8f');
  seedTag.run('個人',   '#4a5568');
  seedTag.run('歴史',   '#7a6030');
})();

// ===== シードヘルパー =====
function getTagIds() {
  const map = {};
  db.prepare('SELECT * FROM tags').all().forEach(t => { map[t.name] = t.id; });
  return map;
}

function seedAccount({ username, email, password, bio, isOfficial, entries }) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    // is_official フラグを確実に反映
    if (isOfficial) db.prepare('UPDATE users SET is_official = 1 WHERE id = ?').run(existing.id);
    return existing.id;
  }

  const userId = uuidv4();
  const hash   = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, username, email, password_hash, bio, is_official) VALUES (?, ?, ?, ?, ?, ?)').run(
    userId, username, email, hash, bio, isOfficial ? 1 : 0
  );

  const tagIds      = getTagIds();
  const insertEntry = db.prepare(`
    INSERT INTO timeline_entries (id, user_id, title, detail, entry_date, visibility)
    VALUES (?, ?, ?, ?, ?, 'public')
  `);
  const insertEntryTag = db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)');

  for (const e of entries) {
    const eid = uuidv4();
    insertEntry.run(eid, userId, e.title, e.detail || '', e.date);
    for (const tname of (e.tags || [])) {
      if (tagIds[tname]) insertEntryTag.run(eid, tagIds[tname]);
    }
  }
  return userId;
}

// ===== デモアカウント =====
db.transaction(() => {
  seedAccount({
    username: 'demo',
    email:    'demo@lifeflow.app',
    password: 'demo1234',
    bio:      'デモアカウントです。自由に操作してお試しください。',
    isOfficial: false,
    entries: [
      { title: '大学入学',             detail: '情報工学科に入学。緊張しながらも期待でいっぱいだった。',                     date: '2016-04-01', tags: ['学業'] },
      { title: 'アルバイト開始',       detail: '週末はカフェでアルバイト。長いシフトだったが仲間に恵まれた。',                 date: '2016-09-15', tags: ['仕事'] },
      { title: 'ベルリン留学',         detail: '6ヶ月間ドイツへ。学業だけでなく、人としても大きく成長できた。',                 date: '2018-02-20', tags: ['旅行', '学業'] },
      { title: '卒業',                 detail: '4年間があっという間だった。誇らしく、そして次への覚悟が湧いた。',               date: '2020-03-25', tags: ['学業', '個人'] },
      { title: '初の正社員就職',       detail: '小さなプロダクトチームにジュニアエンジニアとして入社。実務は学校と全然違う。', date: '2020-07-01', tags: ['仕事'] },
      { title: '新しい街へ引越し',     detail: '仕事のために転居。小さなアパートでの新生活スタート。',                         date: '2020-08-10', tags: ['個人'] },
      { title: '初のハーフマラソン完走', detail: '21km、2時間08分。何ヶ月もの早朝練習が報われた。',                           date: '2021-11-07', tags: ['健康'] },
      { title: 'ミドルエンジニアに昇格', detail: '責任が増えた。小さなチームをリードする役割も担うようになった。',             date: '2022-04-01', tags: ['仕事'] },
      { title: '北海道一周ロードトリップ', detail: '2週間、レンタカー、ノープラン。最高の決断だったと今でも思う。',           date: '2023-08-14', tags: ['旅行', '趣味'] },
      { title: 'このタイムラインを始めた', detail: 'ちゃんと記録を残そうと決意。遅すぎることはない。',                        date: '2024-01-01', tags: ['個人'] },
    ]
  });
})();

// ===== 日本史（公式） =====
db.transaction(() => {
  seedAccount({
    username: '日本史',
    email:    'nihonshi@lifeflow.app',
    password: uuidv4(),
    bio:      '日本の歴史的な出来事のタイムラインです。フォローして自分史と比較してみましょう。',
    isOfficial: true,
    entries: [
      { title: '奈良時代の始まり',         detail: '元明天皇が平城京へ遷都。律令国家の基盤が整備される。',                                  date: '0710-01-01', tags: ['歴史'] },
      { title: '平安京への遷都',           detail: '桓武天皇が山城国への遷都を断行。平安時代の幕開け。',                                    date: '0794-01-01', tags: ['歴史'] },
      { title: '鎌倉幕府の成立',           detail: '源頼朝が武家政権を確立。武士が初めて政治の中心に立つ。',                                  date: '1185-01-01', tags: ['歴史'] },
      { title: '室町幕府の開設',           detail: '足利尊氏が京都室町に幕府を開く。南北朝の分裂が続く動乱期。',                              date: '1336-01-01', tags: ['歴史'] },
      { title: '江戸幕府の成立',           detail: '徳川家康が征夷大将軍に任命。260年以上続く太平の世の始まり。',                              date: '1603-01-01', tags: ['歴史'] },
      { title: '鎖国令の完成',             detail: '外国との交易を長崎のオランダと清に限定。独自の文化が発展する。',                           date: '1639-01-01', tags: ['歴史'] },
      { title: '黒船来航',                 detail: 'ペリー提督率いるアメリカ艦隊が浦賀沖に現れ、開国を迫る。',                                date: '1853-07-08', tags: ['歴史'] },
      { title: '明治維新',                 detail: '大政奉還・王政復古を経て新政府が成立。近代国家への大転換。',                              date: '1868-01-01', tags: ['歴史'] },
      { title: '大日本帝国憲法発布',       detail: 'アジア初の近代的成文憲法。立憲君主制の確立。',                                            date: '1889-02-11', tags: ['歴史'] },
      { title: '関東大震災',               detail: 'M7.9の大地震が関東地方を直撃。10万人以上が犠牲に。',                                      date: '1923-09-01', tags: ['歴史'] },
      { title: '太平洋戦争の終戦',         detail: '昭和天皇がラジオで玉音放送。戦後日本の出発点。',                                          date: '1945-08-15', tags: ['歴史'] },
      { title: '日本国憲法施行',           detail: '国民主権・平和主義・基本的人権の尊重を柱とする新憲法が施行される。',                      date: '1947-05-03', tags: ['歴史'] },
      { title: '東京オリンピック開催',     detail: '戦後復興の象徴として世界に日本の再生を示した第18回夏季五輪。',                            date: '1964-10-10', tags: ['歴史'] },
      { title: 'バブル経済の崩壊',         detail: '株価・地価が急落。「失われた10年」の始まりとなる経済的転換点。',                          date: '1991-01-01', tags: ['歴史'] },
      { title: '阪神・淡路大震災',         detail: 'M7.3の直下型地震。死者6434人。都市型災害の教訓を刻む。',                                  date: '1995-01-17', tags: ['歴史'] },
      { title: '東日本大震災',             detail: 'M9.0の超巨大地震と大津波、原発事故が重なった未曾有の複合災害。',                          date: '2011-03-11', tags: ['歴史'] },
      { title: '東京オリンピック2020',     detail: 'コロナ禍で1年延期ののち無観客で開催。異例の形での五輪となった。',                         date: '2021-07-23', tags: ['歴史'] },
    ]
  });
})();

// ===== アメリカ史（公式） =====
db.transaction(() => {
  seedAccount({
    username: 'アメリカ史',
    email:    'americashi@lifeflow.app',
    password: uuidv4(),
    bio:      'アメリカ合衆国の歴史的な出来事のタイムラインです。フォローして自分史と比較してみましょう。',
    isOfficial: true,
    entries: [
      { title: '独立宣言',                   detail: '13の植民地がイギリスからの独立を宣言。「すべての人間は平等に造られている」。', date: '1776-07-04', tags: ['歴史'] },
      { title: 'アメリカ合衆国憲法発効',     detail: '世界最古の成文憲法が施行。三権分立と連邦制の基盤が確立。',                    date: '1789-03-04', tags: ['歴史'] },
      { title: 'ゴールドラッシュ',           detail: 'カリフォルニアで金が発見。西部開拓と人口爆発のきっかけに。',                  date: '1848-01-24', tags: ['歴史'] },
      { title: '南北戦争の終結',             detail: 'リンカーン大統領のもと連邦軍が勝利。奴隷制度廃止への大きな一歩。',           date: '1865-04-09', tags: ['歴史'] },
      { title: '大陸横断鉄道の完成',         detail: '東西をつなぐ鉄道が開通。アメリカの経済・産業に革命をもたらす。',             date: '1869-05-10', tags: ['歴史'] },
      { title: 'ライト兄弟の初飛行',         detail: '人類初の動力飛行に成功。12秒、36メートル。航空時代の幕明け。',               date: '1903-12-17', tags: ['歴史'] },
      { title: '世界恐慌',                   detail: 'ウォール街の株価暴落から始まる世界的な大不況。失業率25%超に。',              date: '1929-10-24', tags: ['歴史'] },
      { title: '太平洋戦争参戦',             detail: '日本軍による真珠湾奇襲でアメリカが第二次世界大戦に参戦。',                    date: '1941-12-07', tags: ['歴史'] },
      { title: '第二次世界大戦の終結',       detail: '日本の降伏で戦争終結。戦後秩序の形成へ。',                                    date: '1945-09-02', tags: ['歴史'] },
      { title: 'アポロ11号・月面着陸',       detail: 'ニール・アームストロングが人類初の月面歩行。「小さな一歩、偉大な飛躍」。',  date: '1969-07-20', tags: ['歴史'] },
      { title: 'ウォーターゲート事件',       detail: 'ニクソン大統領が盗聴スキャンダルにより辞任。政治不信の象徴。',               date: '1974-08-09', tags: ['歴史'] },
      { title: 'ベルリンの壁崩壊',           detail: '冷戦の象徴が崩れる。ソ連・東欧圏の民主化が加速し冷戦終結へ。',              date: '1989-11-09', tags: ['歴史'] },
      { title: 'インターネットの商業化',     detail: 'WWWの一般公開により情報革命が加速。現代社会の礎が築かれる。',                date: '1991-08-06', tags: ['歴史'] },
      { title: '9.11同時多発テロ',           detail: 'ニューヨーク・ワシントンで同時テロ。対テロ戦争と世界秩序の再編。',           date: '2001-09-11', tags: ['歴史'] },
      { title: 'リーマンショック',           detail: 'リーマン・ブラザーズ破綻。世界金融危機が勃発。',                              date: '2008-09-15', tags: ['歴史'] },
      { title: 'オバマ大統領就任',           detail: 'アフリカ系初の大統領が誕生。「Yes We Can」で世界に希望を。',                  date: '2009-01-20', tags: ['歴史'] },
      { title: 'COVID-19 パンデミック',     detail: '新型コロナウイルスが世界的大流行。アメリカでも多大な犠牲者を出した。',        date: '2020-03-11', tags: ['歴史'] },
      { title: 'バイデン大統領就任',         detail: '議会議事堂占拠事件という混乱の直後に就任。民主主義の試練。',                  date: '2021-01-20', tags: ['歴史'] },
    ]
  });
})();

// ===== 日本のヒット曲（公式） =====
db.transaction(() => {
  seedAccount({
    username: '日本のヒット曲',
    email:    'jphits@lifeflow.app',
    password: uuidv4(),
    bio:      '日本の時代を彩ったヒット曲のタイムラインです。自分史と重ねて「あのころ何を聴いていた？」を振り返ろう。',
    isOfficial: true,
    entries: [
      { title: '上を向いて歩こう / 坂本九',         detail: '世界チャートでも大ヒット。当時の日本の高度経済成長期を象徴する一曲。',                      date: '1961-10-15', tags: ['歴史', '趣味'] },
      { title: '恋のバカンス / ザ・ピーナッツ',      detail: '国民的デュオによる夏の名曲。南国ムード歌謡の代表作。',                                      date: '1963-07-01', tags: ['趣味'] },
      { title: '帰って来たヨッパライ / ザ・フォーク・クルセダーズ', detail: 'テープを逆回転させた奇抜なサウンドで空前の大ヒット。フォークブームの火付け役。', date: '1967-12-25', tags: ['趣味'] },
      { title: '時代 / 中島みゆき',                  detail: '「今はこんなに悲しくて」で始まるこの曲は、世代を超えて歌い継がれ続けている。',             date: '1975-09-01', tags: ['趣味'] },
      { title: 'YOUNG MAN (Y.M.C.A.) / 西城秀樹',   detail: 'ディスコブームとアイドル全盛期を象徴する、振り付きの人気曲。',                              date: '1979-04-05', tags: ['趣味'] },
      { title: 'セーラー服と機関銃 / 薬師丸ひろ子',  detail: '映画主題歌として大ヒット。アイドル映画の頂点となった作品の象徴。',                          date: '1981-11-21', tags: ['趣味'] },
      { title: 'なんてったってアイドル / 小泉今日子', detail: 'バブル期のアイドル文化そのものを自己言及した、ポップ史に残る傑作。',                         date: '1985-11-27', tags: ['趣味'] },
      { title: '悲しい色やね / 上田正樹',            detail: '大阪弁の歌詞が心に刺さるブルース調の名曲。じわじわとロングセラーになった。',                 date: '1982-10-01', tags: ['趣味'] },
      { title: 'ルビーの指環 / 寺尾聰',              detail: '1981年年間1位。大人の別れを描いた洗練されたポップス。',                                       date: '1981-01-21', tags: ['趣味'] },
      { title: 'SAY YES / CHAGE and ASKA',            detail: 'ドラマ主題歌で大ヒット。ミリオンセラーを記録したバブル末期の名曲。',                         date: '1991-09-05', tags: ['趣味'] },
      { title: 'TRUE LOVE / 藤井フミヤ',             detail: 'ドラマ「あすなろ白書」主題歌。90年代ドラマブームを象徴するラブソング。',                     date: '1993-10-21', tags: ['趣味'] },
      { title: 'LOVE LOVE LOVE / DREAMS COME TRUE', detail: 'CDが飛ぶように売れた時代の代表作。爽やかなメロディで誰もが口ずさんだ。',                    date: '1995-07-01', tags: ['趣味'] },
      { title: 'Everything / MISIA',                 detail: '渾身のR&B系バラード。ブライダルの定番曲となり今なお歌われ続ける。',                          date: '2000-01-26', tags: ['趣味'] },
      { title: '世界に一つだけの花 / SMAP',          detail: '累計約315万枚。「ナンバーワンにならなくていい」のフレーズが日本社会に刻まれた。',            date: '2003-03-05', tags: ['趣味'] },
      { title: '栄光の架橋 / ゆず',                  detail: 'アテネ五輪の感動と重なり急速に広まった。卒業式の定番曲として定着。',                         date: '2004-07-14', tags: ['趣味'] },
      { title: '千の風になって / 秋川雅史',          detail: '2006年末から爆発的にヒット。テノール曲がオリコン首位という異例の現象。',                    date: '2006-11-22', tags: ['趣味'] },
      { title: 'ヘビーローテーション / AKB48',       detail: 'AKB48の代名詞となった曲。アイドル戦国時代の幕開けを告げた。',                              date: '2010-08-18', tags: ['趣味'] },
      { title: 'ふるさと / 嵐',                      detail: '東日本大震災復興支援の文脈でも広く歌われた、温かみのある国民的な曲。',                       date: '2012-01-01', tags: ['趣味'] },
      { title: 'パプリカ / Foorin',                  detail: '2020東京五輪応援ソング。子どもたちが踊る映像が社会現象に。',                                 date: '2018-08-15', tags: ['趣味'] },
      { title: 'Pretender / Official髭男dism',       detail: '2019年を代表するポップバラード。ストリーミング時代の到来を印象付けた一曲。',                  date: '2019-06-19', tags: ['趣味'] },
      { title: '夜に駆ける / YOASOBI',               detail: 'テキスト原作×音楽という新形式で登場。ストリーミングで歴史的な再生数を記録した。',             date: '2019-12-03', tags: ['趣味'] },
      { title: 'Dynamite / BTS (邦盤ヒット)',        detail: 'K-POPが日本チャートを席巻した象徴的な一曲。文化の越境を体現した。',                          date: '2020-08-21', tags: ['趣味'] },
      { title: 'うっせぇわ / Ado',                   detail: '10代の鬱憤を代弁する強烈な歌詞とボーカルが若者層を直撃した。',                               date: '2020-10-23', tags: ['趣味'] },
      { title: 'Subtitle / Official髭男dism',        detail: 'ドラマ「silent」主題歌。切なさが胸に刺さるバラードとして異例のロングヒット。',               date: '2022-10-21', tags: ['趣味'] },
    ]
  });
})();

// ===== 日本のHIPHOP史（公式） =====
db.transaction(() => {
  seedAccount({
    username: '日本のHIPHOP史',
    email:    'jphiphop@lifeflow.app',
    password: uuidv4(),
    bio:      '日本のヒップホップ史の重要な出来事・アルバム・アーティストのタイムラインです。',
    isOfficial: true,
    entries: [
      { title: '近田春夫&ビブラストーン 活動開始',        detail: '日本語ラップの草分け的存在。商業的ヒップホップ普及の先駆けとなった。',                            date: '1989-04-01', tags: ['歴史', '趣味'] },
      { title: 'Scha Dara Parr デビュー',                  detail: '「今夜はブギーバック」で日本語ラップを一般に広めた立役者。脱力系スタイルが支持を集めた。',      date: '1990-07-21', tags: ['趣味'] },
      { title: '「今夜はブギーバック」リリース / Scha Dara Parr × 小沢健二', detail: '日本語ラップとJ-POPの融合。チャート上位に食い込み、ヒップホップの認知度を一変させた。', date: '1994-05-25', tags: ['趣味'] },
      { title: 'EAST END×YURI「DA.YO.NE」大ヒット',       detail: '女子高生言葉を取り入れた軽快なラップがメインストリームを席巻。オリコン1位を獲得。',             date: '1994-09-21', tags: ['趣味'] },
      { title: 'キングギドラ「タイムゾーン」リリース',     detail: 'K DUB SHINEとZEEBRAによるハードコアラップ。地下シーンの確立を象徴する一枚。',                    date: '1995-04-05', tags: ['趣味'] },
      { title: 'BUDDHA BRAND「人間発電所」リリース',       detail: 'NYスタイルを忠実に再現した本格派作品。国内アンダーグラウンドに大きな影響を与えた。',             date: '1997-08-06', tags: ['趣味'] },
      { title: 'ZEEBRA「THE RHYME ANIMAL」リリース',       detail: '日本語ラップのひとつの頂点。怒涛のリリシズムで「ラップの神様」の地位を確立した。',               date: '1998-07-01', tags: ['趣味'] },
      { title: 'Dragon Ash「Grateful Days」リリース',      detail: 'ロック×ヒップホップのクロスオーバー。250万枚を超えるヒットで日本語ラップが国民的存在に。', date: '1999-07-28', tags: ['趣味'] },
      { title: 'RHYMESTER「マニフェスト」リリース',        detail: '言葉遊びと社会批評を高いレベルで融合。東京ヒップホップシーンの中心的存在となる。',               date: '2003-10-22', tags: ['趣味'] },
      { title: 'm-flo loves YOSHIKA「miss you」大ヒット', detail: 'クラブミュージックとラップの融合で幅広い層にアピール。m-floが第二の全盛期を迎えた。',            date: '2004-04-14', tags: ['趣味'] },
      { title: 'SEAMO「マトリョーシカ」大ヒット',         detail: 'テレビCMタイアップでチャートを席巻。ポップラップが再び表舞台へ躍り出た。',                         date: '2007-04-25', tags: ['趣味'] },
      { title: '般若「仁義なき戦い」リリース',            detail: '怒りと魂を全開にしたアルバム。裏社会的な語り口でコアなファンを獲得。',                             date: '2010-11-10', tags: ['趣味'] },
      { title: 'KOHH「DIRT」リリース',                    detail: '荒削りな感情とローファイなサウンドが共鳴。インターネット経由で海外でも評価された。',               date: '2013-08-21', tags: ['趣味'] },
      { title: 'AK-69「Till I Die」リリース',             detail: 'スポーツタイアップで国民的知名度を獲得。ラッパーとしてのメジャー展開の成功例となった。',           date: '2014-07-30', tags: ['趣味'] },
      { title: 'BAD HOP デビュー',                        detail: '川崎出身の8人組。ストリートの現実をリアルに描き、10代・20代の絶大な支持を集めた。',               date: '2015-11-11', tags: ['趣味'] },
      { title: 'Creepy Nuts「鬼才、襲来。」リリース',     detail: 'MCバトル出身の文武両道ラッパー。「助演男優賞」がSNSで爆発的に拡散した。',                         date: '2017-06-07', tags: ['趣味'] },
      { title: '『フリースタイルダンジョン』社会現象化',  detail: 'テレビ番組がMCバトルを茶の間に届けた。ヒップホップ人口が急増するきっかけに。',                     date: '2018-01-01', tags: ['趣味'] },
      { title: 'BIM「THE BEAM」リリース',                 detail: '内省的な歌詞とシルキーなフロウが海外からも高い評価を受けた新世代のアルバム。',                     date: '2019-03-27', tags: ['趣味'] },
      { title: 'Awich「Queendom」リリース',               detail: '沖縄出身の女性ラッパーが描くリアル。日本語ラップにおける女性アーティストの地位を押し上げた。',     date: '2021-10-20', tags: ['趣味'] },
      { title: 'ZERNELリリースで次世代台頭',             detail: 'Z世代のラッパーが次々とストリーミングで頭角を現し、シーンの世代交代が本格化。',                     date: '2023-04-01', tags: ['趣味'] },
    ]
  });
})();

// ===== ダミーユーザー =====
db.transaction(() => {
  seedAccount({
    username: 'tanaka_shin',
    email:    'tanaka@example.com',
    password: 'demo1234',
    bio:      '東京在住のサラリーマン。仕事と家族を大切に生きています。',
    isOfficial: false,
    entries: [
      { title: '大学卒業',                 detail: '4年間の学生生活に別れを告げた。就職先が決まり不安と期待が混在。',         date: '2005-03-25', tags: ['学業'] },
      { title: '新卒で商社に入社',         detail: '東京・丸の内のオフィス。最初の3年間は営業で全国を飛び回った。',           date: '2005-04-01', tags: ['仕事'] },
      { title: '結婚',                     detail: '同い年の彼女と結婚。小さな披露宴だったがとても幸せだった。',               date: '2009-11-03', tags: ['家族'] },
      { title: '長男誕生',                 detail: '父親になった実感がわかなかったが、泣き声を聞いて一気に現実に引き戻された。', date: '2011-07-14', tags: ['家族'] },
      { title: '課長に昇進',               detail: '部下を持つのは初めて。プレッシャーよりやりがいの方が大きかった。',         date: '2015-04-01', tags: ['仕事'] },
      { title: '家族で京都旅行',           detail: '子どもが初めての旅行で大興奮。嵐山で竹林を歩いた記憶は一生残るだろう。',   date: '2017-08-13', tags: ['家族', '旅行'] },
      { title: '次女誕生',                 detail: '二人目はすっかり慣れたつもりだったが、やっぱり感動した。',                 date: '2018-02-28', tags: ['家族'] },
      { title: '初のマラソン完走（フル）', detail: '4時間22分。走り切ったときの達成感は言葉にできない。',                      date: '2020-10-18', tags: ['健康'] },
      { title: '部長に昇進',               detail: 'リモートワーク禍での昇進。マネジメントのあり方をゼロから考え直した。',     date: '2022-04-01', tags: ['仕事'] },
      { title: '家族でキャンプを始める',   detail: '子どもたちが外遊びに目覚め、毎月どこかへ出かけるようになった。',           date: '2023-05-03', tags: ['家族', '趣味'] },
    ]
  });

  seedAccount({
    username: 'ono_minami',
    email:    'ono@example.com',
    password: 'demo1234',
    bio:      '旅行と写真が好きな28歳。世界中の絶景を自分の目で見るのが夢。',
    isOfficial: false,
    entries: [
      { title: '初めての海外旅行（タイ）', detail: 'バックパックひとつでバンコクへ。怖いもの知らずの大学1年生だった。',         date: '2016-03-15', tags: ['旅行'] },
      { title: 'デザイン専門学校を卒業',   detail: 'グラフィックデザイナーを目指してポートフォリオ制作に没頭した3年間。',       date: '2018-03-20', tags: ['学業'] },
      { title: 'Web制作会社に就職',        detail: '小さいながらも実力主義の会社。毎日が勉強で1年間で急成長できた。',           date: '2018-04-01', tags: ['仕事'] },
      { title: 'ヨーロッパ一人旅 2週間',   detail: 'パリ・ベルリン・アムステルダム・バルセロナを巡った。芸術に圧倒された旅。',   date: '2019-09-01', tags: ['旅行', '趣味'] },
      { title: 'フリーランス独立',         detail: '会社を辞めてフリーに。最初の3ヶ月は収入ゼロで怖かったが、なんとかなった。', date: '2021-01-04', tags: ['仕事', '個人'] },
      { title: 'モロッコ縦断旅行',         detail: 'マラケシュからサハラ砂漠まで。砂漠で見た星空は人生観が変わるほどだった。',   date: '2022-03-20', tags: ['旅行'] },
      { title: 'フォロワー1万人突破',      detail: 'Instagramで旅の写真を発信してきた結果。少しずつ仕事につながってきた。',     date: '2023-06-10', tags: ['趣味', '仕事'] },
    ]
  });

  seedAccount({
    username: 'sato_riku',
    email:    'sato@example.com',
    password: 'demo1234',
    bio:      '音楽と映画が好き。音楽プロデューサーを目指して勉強中です。',
    isOfficial: false,
    entries: [
      { title: '音楽に目覚める',             detail: '中学2年でギターを始めた。練習が楽しくて毎日6時間弾いていた時期もある。',   date: '2010-04-01', tags: ['趣味'] },
      { title: '高校でバンド結成',           detail: '5人組バンド。コピーバンドから始めて文化祭で初ライブ。',                   date: '2012-10-15', tags: ['趣味'] },
      { title: '音楽大学に進学',             detail: '音楽理論と作曲を本格的に学ぶ。初めて「音楽が職業になる」と信じ始めた頃。', date: '2015-04-01', tags: ['学業', '趣味'] },
      { title: 'DAWを本格的に使い始める',    detail: 'Logic ProでビートメイキングやMix作業を学ぶ。部屋にこもりっきりだった。',   date: '2016-09-01', tags: ['趣味', '学業'] },
      { title: '音楽プロダクション会社に就職', detail: 'CMやゲームの音楽制作を手伝う仕事。地味だけど勉強になることばかり。',     date: '2019-04-01', tags: ['仕事'] },
      { title: 'アーティストの楽曲プロデュース初仕事', detail: '友人のシンガーに楽曲を提供。Spotifyで少しだけ再生数が伸びた。',  date: '2021-08-15', tags: ['仕事', '趣味'] },
      { title: '初のシングル自主リリース',   detail: '自分名義で初めての作品。SNSでシェアしたら1000再生を超えた。嬉しかった。', date: '2022-12-07', tags: ['趣味', '仕事'] },
      { title: '音楽制作スタジオ立ち上げ',   detail: '仲間と共同で小さなスタジオを借りた。夢への一歩が始まった気がする。',       date: '2024-01-15', tags: ['仕事', '個人'] },
    ]
  });
})();

// ===== フォロー関係のシード（デモ → 公式・ダミーユーザー） =====
db.transaction(() => {
  const insertFollow = db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)');

  const ids = {};
  ['demo', 'tanaka_shin', 'ono_minami', 'sato_riku', '日本史', 'アメリカ史', '日本のヒット曲', '日本のHIPHOP史'].forEach(name => {
    const row = db.prepare('SELECT id FROM users WHERE username = ?').get(name);
    if (row) ids[name] = row.id;
  });

  // demo → 全員フォロー
  ['tanaka_shin', 'ono_minami', 'sato_riku', '日本史', 'アメリカ史', '日本のヒット曲', '日本のHIPHOP史'].forEach(name => {
    if (ids['demo'] && ids[name]) insertFollow.run(ids['demo'], ids[name]);
  });

  // tanaka_shin → ono_minami, sato_riku, 日本史
  ['ono_minami', 'sato_riku', '日本史'].forEach(name => {
    if (ids['tanaka_shin'] && ids[name]) insertFollow.run(ids['tanaka_shin'], ids[name]);
  });

  // ono_minami → tanaka_shin, 日本のヒット曲, アメリカ史
  ['tanaka_shin', '日本のヒット曲', 'アメリカ史'].forEach(name => {
    if (ids['ono_minami'] && ids[name]) insertFollow.run(ids['ono_minami'], ids[name]);
  });

  // sato_riku → 日本のHIPHOP史, 日本のヒット曲
  ['日本のHIPHOP史', '日本のヒット曲'].forEach(name => {
    if (ids['sato_riku'] && ids[name]) insertFollow.run(ids['sato_riku'], ids[name]);
  });
})();

module.exports = db;


