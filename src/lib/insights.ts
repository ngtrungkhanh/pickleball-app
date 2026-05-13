import {
  buildAnalysisSnapshot,
  edgeRecord,
  type AnalysisMatch,
  type AnalysisPlayer,
  type AnalysisSnapshot,
  type PlayerMetrics,
} from './analysis-core';

export type Insight = {
  type: string;
  title: string;
  text: string;
  playersInvolved: string[];
  rarity?: InsightRarity;
  weight?: number;
};

type InsightGroup = 'form' | 'elo' | 'partner' | 'opponent' | 'score' | 'fun' | 'activity';
type InsightRarity = 'common' | 'uncommon' | 'rare' | 'epic';

type InsightCandidate = Insight & {
  group: InsightGroup;
  participantIds: string[];
  priority: number;
  metricScore: number;
};

type TextContext = Record<string, string | number>;

const RARITY_SCORE: Record<InsightRarity, number> = {
  common: 0,
  uncommon: 8,
  rare: 16,
  epic: 26,
};

function seededIndex(seed: string, length: number) {
  if (length <= 1) return 0;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

function fillTemplate(template: string, context: TextContext) {
  return Object.entries(context).reduce((text, [key, value]) => {
    return text.replaceAll(`{${key}}`, String(value));
  }, template);
}

function pickText(type: string, participants: string[], templates: string[], context: TextContext) {
  const seed = `${type}|${participants.join('|')}|${Object.values(context).join('|')}`;
  return fillTemplate(templates[seededIndex(seed, templates.length)], context);
}

function namesFor(snapshot: AnalysisSnapshot, ids: string[]) {
  return ids.map(id => snapshot.metrics.get(id)?.name || snapshot.visiblePlayers.find(player => player.id === id)?.name || id);
}

function addCandidate(
  target: InsightCandidate[],
  snapshot: AnalysisSnapshot,
  config: {
    type: string;
    title: string;
    group: InsightGroup;
    rarity: InsightRarity;
    weight: number;
    priority: number;
    metricScore?: number;
    participantIds: string[];
    context: TextContext;
    templates: string[];
  }
) {
  const playersInvolved = namesFor(snapshot, config.participantIds);
  target.push({
    type: config.type,
    title: config.title,
    text: pickText(config.type, config.participantIds, config.templates, config.context),
    playersInvolved,
    rarity: config.rarity,
    weight: config.weight,
    group: config.group,
    participantIds: config.participantIds,
    priority: config.priority,
    metricScore: config.metricScore || 0,
  });
}

function rounded(value: number) {
  return Math.round(value);
}

function abs(value: number) {
  return Math.abs(Math.round(value));
}

function isEnough(metric: PlayerMetrics, min = 5) {
  return metric.total >= min;
}

function addPlayerCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot) {
  const activeMetrics = snapshot.playerMetrics.filter(metric => metric.total > 0);
  const topAttack = [...activeMetrics].filter(metric => metric.total >= 8).sort((a, b) => b.attackScore - a.attackScore)[0];
  const topActivity = [...activeMetrics].sort((a, b) => b.total - a.total)[0];
  const topElo = snapshot.board[0];
  const secondElo = snapshot.board[1];

  if (topElo && topElo.total >= 8) {
    const gap = topElo.rating - (secondElo?.rating || 1000);
    addCandidate(candidates, snapshot, {
      type: 'elo_king',
      title: '👑 ÔNG TRÙM ELO',
      group: 'elo',
      rarity: gap >= 40 ? 'rare' : 'common',
      weight: gap >= 40 ? 8 : 2,
      priority: gap >= 40 ? 82 : 60,
      metricScore: gap,
      participantIds: [topElo.id],
      context: { name: topElo.name, elo: topElo.rating, gap: Math.max(0, gap) },
      templates: [
        '{name} đang giữ nóc ELO với {elo} điểm, bỏ nhóm sau {gap} điểm. Muốn lật kèo này chắc phải đánh thật tỉnh.',
        'Ngai ELO đang nằm trong tay {name}: {elo} điểm và cách người bám đuổi {gap} điểm.',
        '{name} đang làm chủ bảng ELO với {elo} điểm. Khoảng cách {gap} điểm đủ để anh em phải tính kèo kỹ hơn.',
        'BXH ELO hiện gọi tên {name}. {elo} điểm, hơn nhóm sau {gap} điểm, không phải tự nhiên mà đứng đầu.',
      ],
    });
  }

  activeMetrics.forEach(metric => {
    if (metric.streakType === 'W' && metric.streakCount >= 4) {
      addCandidate(candidates, snapshot, {
        type: 'hot_streak',
        title: '🔥 ĐANG CHÁY MÁY',
        group: 'form',
        rarity: metric.streakCount >= 6 ? 'epic' : 'rare',
        weight: 10,
        priority: 90 + metric.streakCount,
        metricScore: metric.streakCount,
        participantIds: [metric.id],
        context: { name: metric.name, count: metric.streakCount },
        templates: [
          '{name} đang thắng liền {count} trận, bóng sang bên kia là có mùi sập hầm.',
          'Chuỗi {count} trận xanh của {name} đang nóng thật sự. Ai bắt cặp đối đầu nhớ chuẩn bị thở oxy.',
          '{name} vào form hơi gắt: {count} trận thắng liên tiếp, đánh đâu cũng thấy có cửa đóng hòm.',
          'Mạch thắng {count} trận đưa {name} lên chế độ cháy máy, nhìn là biết đang rất khó cản.',
        ],
      });
    }

    if (metric.streakType === 'L' && metric.streakCount >= 4) {
      addCandidate(candidates, snapshot, {
        type: 'cold_streak',
        title: '🧯 SẬP HẦM LIÊN TỤC',
        group: 'form',
        rarity: metric.streakCount >= 6 ? 'epic' : 'rare',
        weight: 10,
        priority: 88 + metric.streakCount,
        metricScore: metric.streakCount,
        participantIds: [metric.id],
        context: { name: metric.name, count: metric.streakCount },
        templates: [
          '{name} đang đỏ liền {count} trận. Có lẽ phải đi giải hạn trước khi vào kèo tiếp.',
          '{count} trận thua liên tiếp khiến {name} hơi sập hầm, cần một trận xanh để lấy lại vía.',
          'Vía đang hơi nặng với {name}: {count} trận chưa thoát đỏ, nhìn điểm là thấy cần oxy.',
          '{name} kẹt chuỗi thua {count} trận. Không phải hết trình, nhưng mood sân đang hơi tối.',
        ],
      });
    }

    if (metric.total >= 5 && metric.formScore === 100) {
      addCandidate(candidates, snapshot, {
        type: 'perfect_form5',
        title: '🚀 5 TRẬN TOÀN XANH',
        group: 'form',
        rarity: 'epic',
        weight: 10,
        priority: 94,
        metricScore: metric.formScore,
        participantIds: [metric.id],
        context: { name: metric.name },
        templates: [
          '5 trận gần nhất của {name} toàn thắng. Form này không còn là nóng tay, đây là cháy sân.',
          '{name} vừa quét sạch 5 trận gần nhất, anh em gặp kèo này phải tính đường né gió.',
          'Phong độ gần đây của {name} là 5/5 xanh. Ráp vào team nào cũng thấy có mùi thắng.',
          '{name} đang bứt tốc rõ rệt: 5 trận gần nhất không rơi một trận nào.',
        ],
      });
    }

    if (metric.total >= 5 && metric.formScore === 0) {
      addCandidate(candidates, snapshot, {
        type: 'zero_form5',
        title: '🫠 5 TRẬN TOÀN ĐỎ',
        group: 'form',
        rarity: 'epic',
        weight: 10,
        priority: 93,
        metricScore: 100,
        participantIds: [metric.id],
        context: { name: metric.name },
        templates: [
          '5 trận gần nhất của {name} toàn đỏ. Giai đoạn này cần một kèo giải hạn đúng nghĩa.',
          '{name} đang ngộp thở với 5 trận gần nhất không có xanh, nhìn lịch sử là thấy hơi đau.',
          'Chuỗi form gần đây của {name} hơi tối: 0/5 trận thắng, cần kéo mood lại gấp.',
          '{name} đang có 5 trận gần nhất toàn thua. Không vỡ trận thì cũng đang rất cần đổi vía.',
        ],
      });
    }

    if (metric.upsetWins > 0) {
      addCandidate(candidates, snapshot, {
        type: 'upset_hero',
        title: '🎯 VUA GẠT GIÒ',
        group: 'elo',
        rarity: metric.upsetWins >= 2 ? 'epic' : 'rare',
        weight: 9,
        priority: 88 + metric.upsetWins * 4,
        metricScore: metric.upsetWins,
        participantIds: [metric.id],
        context: { name: metric.name, count: metric.upsetWins },
        templates: [
          '{name} có {count} lần thắng cửa dưới dưới 30%. Máy tính đo một kiểu, lên sân lại lật kèo một kiểu.',
          'Đừng nhìn kèo máy mà khinh {name}: đã {count} lần gạt giò cửa trên thành công.',
          '{name} đúng chất thợ săn kèo khó, {count} lần thắng khi xác suất ban đầu dưới 30%.',
          'Kèo càng bị đánh giá thấp, {name} càng dễ lên đồng: {count} cú lật kèo cửa dưới đã được ghi nhận.',
        ],
      });
    }

    if (metric.upsetLosses > 0) {
      addCandidate(candidates, snapshot, {
        type: 'upset_victim',
        title: '💥 NẠN NHÂN ĐỊA CHẤN',
        group: 'elo',
        rarity: metric.upsetLosses >= 2 ? 'rare' : 'uncommon',
        weight: 7,
        priority: 78 + metric.upsetLosses * 3,
        metricScore: metric.upsetLosses,
        participantIds: [metric.id],
        context: { name: metric.name, count: metric.upsetLosses },
        templates: [
          '{name} đã {count} lần thua khi cửa thắng trên 70%. Kèo tưởng thơm mà hóa ra sập hầm.',
          'Máy tính từng ưu ái {name}, nhưng sân phủi không dễ đoán: {count} lần cửa trên vẫn rơi điểm.',
          '{name} có {count} trận bị lật dù xác suất thắng rất cao. Đây là loại đau mà bảng số biết nói.',
          '{count} lần thua cửa trên khiến {name} phải dè chừng, vì kèo đẹp chưa chắc đã dễ ăn.',
        ],
      });
    }

    if (metric.total >= 20 && Math.abs(metric.rating - 1000) <= 20) {
      addCandidate(candidates, snapshot, {
        type: 'gatekeeper',
        title: '🧱 NGƯỜI GIỮ CỔNG',
        group: 'elo',
        rarity: 'uncommon',
        weight: 5,
        priority: 70,
        metricScore: metric.total,
        participantIds: [metric.id],
        context: { name: metric.name, total: metric.total, elo: metric.rating },
        templates: [
          '{name} đã đánh {total} trận mà ELO vẫn quanh {elo}. Không lên nóc, không rơi đáy, đúng chuẩn giữ cổng.',
          '{total} trận trôi qua, {name} vẫn neo ELO ở {elo}. Ai muốn test trình trung bình cứ tìm kèo này.',
          '{name} là mốc kiểm định rất ổn: {total} trận, ELO {elo}, thắng thua đủ để đo tay anh em.',
          'ELO {elo} sau {total} trận biến {name} thành cửa kiểm tra phong độ khá chuẩn cho cả sân.',
        ],
      });
    }

    if (topAttack?.id === metric.id && metric.attackScore >= 90) {
      addCandidate(candidates, snapshot, {
        type: 'top_attack',
        title: '💣 CỖ MÁY DẬP BÓNG',
        group: 'score',
        rarity: 'uncommon',
        weight: 6,
        priority: 76,
        metricScore: metric.attackScore,
        participantIds: [metric.id],
        context: { name: metric.name, score: rounded(metric.attackScore), avg: metric.avgPointsFor.toFixed(1) },
        templates: [
          '{name} đang là máy bào điểm của sân: trung bình {avg} điểm/trận, chỉ số công {score}.',
          'Điểm số của {name} lên đều thật sự, trung bình {avg} điểm mỗi trận. Đánh kiểu này rất khó bị bỏ xa.',
          '{name} đang dẫn nhóm tấn công với chỉ số {score}, trung bình kéo được {avg} điểm/trận.',
          'Cứ nhìn điểm ghi là thấy {name} đang vào tay: {avg} điểm/trận, chỉ số công {score}.',
        ],
      });
    }

    if (isEnough(metric, 8) && metric.avgConceded <= 5) {
      addCandidate(candidates, snapshot, {
        type: 'defense_wall',
        title: '🛡️ BỨC TƯỜNG BÊ TÔNG',
        group: 'score',
        rarity: metric.avgConceded <= 4 ? 'rare' : 'uncommon',
        weight: 8,
        priority: 82,
        metricScore: 10 - metric.avgConceded,
        participantIds: [metric.id],
        context: { name: metric.name, avg: metric.avgConceded.toFixed(1) },
        templates: [
          '{name} phòng thủ rất gắt, trung bình chỉ để mất {avg} điểm/trận. Muốn xuyên tường này không dễ.',
          'Đối thủ gặp {name} thường bị bóp điểm khá nặng: chỉ {avg} điểm/trận lọt qua.',
          '{name} đang giữ sân cực kín, điểm mất trung bình chỉ {avg}. Đây mới là thủ đúng nghĩa.',
          'Bảng điểm nói hộ {name}: trung bình mất {avg} điểm/trận, hàng thủ không hề mềm.',
        ],
      });
    }

    if (metric.dominantWins >= 4) {
      addCandidate(candidates, snapshot, {
        type: 'dominant_closer',
        title: '⚰️ ĐÓNG HÒM CHÓNG VÁNH',
        group: 'score',
        rarity: metric.dominantWins >= 6 ? 'rare' : 'uncommon',
        weight: 7,
        priority: 78 + metric.dominantWins,
        metricScore: metric.dominantWins,
        participantIds: [metric.id],
        context: { name: metric.name, count: metric.dominantWins },
        templates: [
          '{name} có {count} trận thắng cách biệt từ 7 điểm. Đã thắng là thường thắng rất sâu.',
          '{count} lần đóng hòm đối thủ cho thấy {name} không thích dây dưa khi đã vào tay.',
          '{name} đã {count} lần thắng áp đảo, kiểu thắng khiến bên kia chỉ biết nhìn bảng điểm.',
          'Khi {name} bắt được nhịp, trận đấu kết thúc rất nhanh: {count} trận thắng cách biệt sâu.',
        ],
      });
    }

    if (metric.closeLosses >= 3) {
      addCandidate(candidates, snapshot, {
        type: 'close_loss',
        title: '🥲 THÁNH NHỌ SÂN BÃI',
        group: 'score',
        rarity: metric.closeLosses >= 5 ? 'rare' : 'uncommon',
        weight: 7,
        priority: 76 + metric.closeLosses,
        metricScore: metric.closeLosses,
        participantIds: [metric.id],
        context: { name: metric.name, count: metric.closeLosses },
        templates: [
          '{name} thua sát nút {count} trận. Thiếu đúng một nhịp là từ đỏ chuyển xanh.',
          '{count} trận thua sát cho thấy {name} không dễ vỡ, nhưng đoạn chốt hạ đang hơi thiếu duyên.',
          'Vận may cuối game chưa đứng về phía {name}: {count} lần thua sát nút rồi.',
          '{name} có {count} trận chỉ thua 1-2 điểm. Đen nhẹ thôi, không phải sập trình.',
        ],
      });
    }

    if (metric.deuceMatches >= 3) {
      addCandidate(candidates, snapshot, {
        type: 'deuce_addict',
        title: '🥵 ĐAM MÊ CÒ CƯA',
        group: 'score',
        rarity: metric.deuceMatches >= 5 ? 'rare' : 'uncommon',
        weight: 7,
        priority: 76 + metric.deuceMatches,
        metricScore: metric.deuceMatches,
        participantIds: [metric.id],
        context: { name: metric.name, count: metric.deuceMatches },
        templates: [
          'Đánh với {name} dễ kéo qua 11 điểm: {count} trận deuce, đúng kiểu cò cưa tới mệt.',
          '{name} góp mặt trong {count} trận dây dưa qua 11 điểm. Vào kèo này nhớ giữ pin.',
          '{count} trận deuce có mặt {name}, đủ hiểu người này rất biết kéo drama điểm số.',
          '{name} không thích thắng thua nhanh: {count} trận phải kéo quá 11 điểm mới chịu xong.',
        ],
      });
    }

    if (metric.bagelLosses > 0) {
      addCandidate(candidates, snapshot, {
        type: 'bagel_loss',
        title: '🔌 SẬP NGUỒN',
        group: 'score',
        rarity: metric.bagelLosses >= 2 ? 'rare' : 'uncommon',
        weight: 6,
        priority: 72 + metric.bagelLosses,
        metricScore: metric.bagelLosses,
        participantIds: [metric.id],
        context: { name: metric.name, count: metric.bagelLosses },
        templates: [
          '{name} có {count} trận thua mà team chỉ lên tối đa 2 điểm. Đây là dạng sập nguồn cần quên nhanh.',
          '{count} lần điểm số tụt xuống mức báo động, {name} chắc không muốn xem lại highlight này.',
          '{name} đã {count} lần dính trận quá sâu, kiểu điểm số nhìn vào là muốn tắt app.',
          'Có {count} trận team của {name} chỉ ghi được 0-2 điểm. Kèo đó đúng nghĩa mất điện.',
        ],
      });
    }

    if (topActivity?.id === metric.id && metric.total >= 20) {
      addCandidate(candidates, snapshot, {
        type: 'iron_lung',
        title: '🚜 LÁ PHỔI BÒ',
        group: 'activity',
        rarity: metric.dailyMaxMatches >= 6 ? 'rare' : 'common',
        weight: 5,
        priority: 66 + Math.min(10, metric.dailyMaxMatches),
        metricScore: metric.total,
        participantIds: [metric.id],
        context: { name: metric.name, total: metric.total, daily: metric.dailyMaxMatches },
        templates: [
          '{name} đang là máy cày của sân với {total} trận, có ngày quất tới {daily} trận.',
          'Độ chăm của {name} khỏi bàn: {total} trận tổng, đỉnh điểm {daily} trận trong một ngày.',
          '{name} ra sân như chấm công, tích lũy {total} trận và từng đánh {daily} trận/ngày.',
          'Nếu tính độ bền, {name} đang dẫn sóng: {total} trận, ngày cao nhất {daily} trận.',
        ],
      });
    }

    if (metric.daysAbsent !== null && metric.daysAbsent >= 7) {
      addCandidate(candidates, snapshot, {
        type: 'missing_player',
        title: '🕶️ QUY ẨN GIANG HỒ',
        group: 'activity',
        rarity: metric.daysAbsent >= 21 ? 'rare' : 'uncommon',
        weight: 5,
        priority: 64 + Math.min(20, metric.daysAbsent),
        metricScore: metric.daysAbsent,
        participantIds: [metric.id],
        context: { name: metric.name, days: metric.daysAbsent },
        templates: [
          '{name} đã vắng mặt {days} ngày. Anh em bắt đầu quên cảm giác bị người này báo điểm rồi.',
          '{days} ngày chưa thấy {name} ra sân, có vẻ đang tu luyện hoặc né quỹ phạt.',
          '{name} quy ẩn {days} ngày rồi. Sân vẫn chạy, nhưng thiếu một gương mặt quen.',
          'Đã {days} ngày {name} chưa xuất hiện. Nếu đây là chiến thuật giấu bài thì hơi lâu.',
        ],
      });
    }

    if (metric.total > 0 && metric.total <= 5 && metric.winRate >= 80) {
      addCandidate(candidates, snapshot, {
        type: 'mercenary',
        title: '🏕️ LÍNH ĐÁNH THUÊ',
        group: 'activity',
        rarity: 'rare',
        weight: 7,
        priority: 74,
        metricScore: metric.winRate,
        participantIds: [metric.id],
        context: { name: metric.name, total: metric.total, rate: rounded(metric.winRate) },
        templates: [
          '{name} mới đánh {total} trận nhưng winrate {rate}%. Ra sân ít mà chất lượng hơi cao.',
          '{total} trận là mẫu còn mỏng, nhưng {name} đang cầm {rate}% thắng. Lính đánh thuê đúng nghĩa.',
          '{name} xuất hiện ít, đánh {total} trận, nhưng tỉ lệ thắng {rate}% khiến anh em phải để ý.',
          'Không ra sân nhiều, nhưng {name} có {rate}% thắng sau {total} trận. Ít mà đau.',
        ],
      });
    }

    if (metric.alternations >= 5) {
      addCandidate(candidates, snapshot, {
        type: 'alternating_form',
        title: '🎛️ MÁY TEST VỢT',
        group: 'fun',
        rarity: 'uncommon',
        weight: 5,
        priority: 66 + metric.alternations,
        metricScore: metric.alternations,
        participantIds: [metric.id],
        context: { name: metric.name },
        templates: [
          'Form của {name} bật tắt liên tục, thắng thua xen kẽ như đang test vợt mới.',
          '{name} đang khó đoán thật sự: vừa xanh đã đỏ, vừa đỏ lại xanh.',
          'Chuỗi gần đây của {name} không chịu đi theo đường thẳng. Bảng form nhìn như sóng điện.',
          'Muốn dự đoán {name} trận tới hơi khó, vì form đang đổi màu liên tục.',
        ],
      });
    }
  });
}

function addPartnerCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot) {
  snapshot.partnerEdges.filter(edge => edge.total >= 4).forEach(edge => {
    if (edge.rate >= 75) {
      addCandidate(candidates, snapshot, {
        type: 'perfect_duo',
        title: '🤝 CẶP BÀI TRÙNG',
        group: 'partner',
        rarity: edge.total >= 8 || edge.impact >= 15 ? 'rare' : 'uncommon',
        weight: 8,
        priority: 82 + Math.min(10, edge.total),
        metricScore: edge.confidence,
        participantIds: [edge.playerId, edge.otherId],
        context: { a: edge.playerName, b: edge.otherName, record: edgeRecord(edge), impact: edge.impact },
        templates: [
          '{a} đánh chung với {b} đang rất bén: {record}, hiệu suất lệch {impact} điểm so với baseline.',
          'Cặp {a} - {b} có số đẹp thật sự: {record}. Impact {impact} cho thấy không chỉ là winrate ảo.',
          'Ráp {a} với {b} đang ra bài rất ổn: {record}, chênh hiệu suất {impact} điểm.',
          '{a} và {b} là cặp đáng để ý: {record}, dữ liệu đang nghiêng mạnh về hướng hợp cạ.',
        ],
      });
    }

    if (edge.rate <= 25) {
      addCandidate(candidates, snapshot, {
        type: 'bad_duo',
        title: '⚓ DẪM CHÂN NHAU',
        group: 'partner',
        rarity: edge.total >= 8 || edge.impact <= -15 ? 'rare' : 'uncommon',
        weight: 8,
        priority: 82 + Math.min(10, edge.total),
        metricScore: edge.confidence,
        participantIds: [edge.playerId, edge.otherId],
        context: { a: edge.playerName, b: edge.otherName, record: edgeRecord(edge), impact: edge.impact },
        templates: [
          '{a} ghép với {b} đang hơi khắc hệ: {record}, hiệu suất lệch {impact} điểm.',
          'Cặp {a} - {b} nhìn dữ liệu khá đau: {record}. Impact {impact} cho thấy cần đổi bài.',
          'Mỗi lần {a} đứng cùng {b} là kèo hơi nặng: {record}, chênh hiệu suất {impact} điểm.',
          '{a} và {b} cần xem lại cách ráp đội: {record}, số liệu đang báo dẫm chân nhau.',
        ],
      });
    }

    if (edge.impact >= 15) {
      addCandidate(candidates, snapshot, {
        type: 'partner_boost',
        title: '🧿 BÙA HỘ MỆNH',
        group: 'partner',
        rarity: edge.impact >= 25 ? 'epic' : 'rare',
        weight: 9,
        priority: 88 + Math.min(12, edge.impact),
        metricScore: edge.impact + edge.total,
        participantIds: [edge.playerId, edge.otherId],
        context: { a: edge.playerName, b: edge.otherName, impact: edge.impact, record: edgeRecord(edge) },
        templates: [
          'Cứ có {b} bên cạnh là {a} đánh sáng hơn hẳn: +{impact} điểm hiệu suất, record {record}.',
          '{b} đang là bùa hộ mệnh của {a}: hiệu suất tăng +{impact}, thành tích {record}.',
          'Dữ liệu nói khá rõ: {a} gặp {b} là lên tay, +{impact} điểm hiệu suất qua {record}.',
          '{a} đánh cùng {b} không chỉ thắng nhiều mà còn vượt baseline +{impact} điểm.',
        ],
      });
    }

    if (edge.impact <= -15) {
      addCandidate(candidates, snapshot, {
        type: 'partner_drag',
        title: '🪨 QUẢ TẠ VÀNG',
        group: 'partner',
        rarity: edge.impact <= -25 ? 'epic' : 'rare',
        weight: 9,
        priority: 88 + Math.min(12, abs(edge.impact)),
        metricScore: abs(edge.impact) + edge.total,
        participantIds: [edge.playerId, edge.otherId],
        context: { a: edge.playerName, b: edge.otherName, impact: abs(edge.impact), record: edgeRecord(edge) },
        templates: [
          '{a} đánh cùng {b} đang tụt {impact} điểm hiệu suất. Record {record} nhìn là thấy hơi nặng vai.',
          'Cặp {a} - {b} cần đi giải hạn: hiệu suất giảm {impact} điểm, thành tích {record}.',
          '{b} đứng cạnh {a} đang kéo chỉ số xuống {impact} điểm. Đây là dấu hiệu khắc lối chơi.',
          'Dữ liệu đang không bênh cặp {a} - {b}: {record}, hiệu suất tụt {impact} điểm.',
        ],
      });
    }
  });
}

function addOpponentCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot) {
  const repeatedEdges = snapshot.opponentEdges.filter(edge => edge.total >= 4);
  const mostRepeated = [...repeatedEdges].sort((a, b) => b.total - a.total)[0];

  repeatedEdges.forEach(edge => {
    if (edge.rate === 100) {
      addCandidate(candidates, snapshot, {
        type: 'hard_counter',
        title: '🦅 KHẮC TINH',
        group: 'opponent',
        rarity: edge.total >= 6 ? 'epic' : 'rare',
        weight: 9,
        priority: 90 + edge.total,
        metricScore: edge.total,
        participantIds: [edge.playerId, edge.otherId],
        context: { a: edge.playerName, b: edge.otherName, total: edge.total },
        templates: [
          '{a} gặp {b} đang toàn thắng {total}/{total}. Đây không còn là hên, đây là bắt bài.',
          'Cứ bên kia lưới có {b}, {a} lại sáng cửa: {total} trận đối đầu toàn xanh.',
          '{a} đang là khắc tinh của {b}: gặp {total} lần thắng cả {total}.',
          'Kèo {a} gặp {b} hiện nghiêng hẳn một chiều: {total}/{total} trận xanh cho {a}.',
        ],
      });
    }

    if (edge.rate === 0) {
      addCandidate(candidates, snapshot, {
        type: 'target_dummy',
        title: '🧸 BỊCH BÔNG GIẢI TRÍ',
        group: 'opponent',
        rarity: edge.total >= 6 ? 'epic' : 'rare',
        weight: 9,
        priority: 90 + edge.total,
        metricScore: edge.total,
        participantIds: [edge.playerId, edge.otherId],
        context: { a: edge.playerName, b: edge.otherName, total: edge.total },
        templates: [
          '{a} gặp {b} đang thua cả {total}/{total}. Kèo này nhìn vào là thấy hơi át vía.',
          'Mỗi lần đối đầu {b}, {a} chưa tìm được cửa xanh: {total} trận toàn đỏ.',
          '{b} đang là bài toán khó chịu với {a}: gặp {total} lần, {a} chưa thắng lần nào.',
          'Kèo {a} gặp {b} hiện khá đau: {total}/{total} trận đỏ, cần đổi chiến thuật thật.',
        ],
      });
    }

    if (edge.impact >= 15) {
      addCandidate(candidates, snapshot, {
        type: 'sweet_matchup',
        title: '🍯 KÈO THƠM',
        group: 'opponent',
        rarity: edge.impact >= 25 ? 'epic' : 'rare',
        weight: 8,
        priority: 86 + Math.min(12, edge.impact),
        metricScore: edge.impact + edge.total,
        participantIds: [edge.playerId, edge.otherId],
        context: { a: edge.playerName, b: edge.otherName, impact: edge.impact, record: edgeRecord(edge) },
        templates: [
          '{a} gặp {b} là hiệu suất tăng +{impact} điểm. Record {record} cho thấy kèo này khá thơm.',
          'Đối đầu {b}, {a} đánh vượt baseline +{impact} điểm. Thành tích {record} không phải ngẫu nhiên.',
          '{b} đang là matchup dễ chịu với {a}: +{impact} điểm hiệu suất, {record}.',
          'Số liệu nghiêng về {a} khi gặp {b}: {record}, hiệu suất cao hơn bình thường {impact} điểm.',
        ],
      });
    }

    if (edge.impact <= -15) {
      addCandidate(candidates, snapshot, {
        type: 'nightmare_matchup',
        title: '😵 KÈO KHÓ',
        group: 'opponent',
        rarity: edge.impact <= -25 ? 'epic' : 'rare',
        weight: 8,
        priority: 86 + Math.min(12, abs(edge.impact)),
        metricScore: abs(edge.impact) + edge.total,
        participantIds: [edge.playerId, edge.otherId],
        context: { a: edge.playerName, b: edge.otherName, impact: abs(edge.impact), record: edgeRecord(edge) },
        templates: [
          '{a} gặp {b} là hiệu suất tụt {impact} điểm. Record {record} cho thấy kèo này không dễ thở.',
          '{b} đang làm {a} đánh dưới baseline {impact} điểm. Thành tích {record} khá biết nói.',
          'Kèo {a} gặp {b} hơi sập hầm: {record}, hiệu suất thấp hơn bình thường {impact} điểm.',
          '{a} cần tìm lời giải khi gặp {b}: hiệu suất giảm {impact} điểm qua {record}.',
        ],
      });
    }

    if (edge.deuceGames >= 3) {
      addCandidate(candidates, snapshot, {
        type: 'deuce_rivalry',
        title: '🪢 CỨ GẶP LÀ DÂY DƯA',
        group: 'opponent',
        rarity: 'uncommon',
        weight: 6,
        priority: 76 + edge.deuceGames,
        metricScore: edge.deuceGames,
        participantIds: [edge.playerId, edge.otherId],
        context: { a: edge.playerName, b: edge.otherName, count: edge.deuceGames },
        templates: [
          '{a} gặp {b} đã có {count} trận kéo deuce. Kèo này không cho ai thắng nhanh.',
          'Cứ {a} đối đầu {b} là dễ dây dưa: {count} trận phải kéo qua 11 điểm.',
          '{count} trận deuce giữa {a} và {b} cho thấy cặp đối đầu này rất biết bào thể lực.',
          'Kèo {a} - {b} thường không gọn: {count} lần kéo deuce rồi.',
        ],
      });
    }
  });

  if (mostRepeated && mostRepeated.total >= 6 && mostRepeated.rate >= 40 && mostRepeated.rate <= 60) {
    addCandidate(candidates, snapshot, {
      type: 'balanced_rivalry',
      title: '⚔️ KỲ PHÙNG ĐỊCH THỦ',
      group: 'opponent',
      rarity: 'uncommon',
      weight: 7,
      priority: 78 + mostRepeated.total,
      metricScore: mostRepeated.total,
      participantIds: [mostRepeated.playerId, mostRepeated.otherId],
      context: { a: mostRepeated.playerName, b: mostRepeated.otherName, record: edgeRecord(mostRepeated) },
      templates: [
        '{a} và {b} gặp nhau nhiều mà vẫn cân: {record}. Đây là kèo đúng nghĩa phải đánh mới biết.',
        'Kèo {a} - {b} đang rất ngang: {record}, không ai thật sự bắt nạt được ai.',
        '{a} đối đầu {b} đủ nhiều để thấy độ cân: {record}. Kèo này đáng xem.',
        '{record} giữa {a} và {b} cho thấy hai bên đang kỳ phùng địch thủ thật sự.',
      ],
    });
  }
}

function selectInsights(candidates: InsightCandidate[], limit = 8) {
  const finalInsights: InsightCandidate[] = [];
  const playerMentions = new Map<string, number>();
  const playerGroups = new Map<string, Set<InsightGroup>>();
  const usedTypes = new Set<string>();

  const scored = [...candidates].sort((a, b) => {
    const aScore = a.priority + RARITY_SCORE[a.rarity || 'common'] + (a.weight || 0) * 1.8 + a.metricScore * 0.2;
    const bScore = b.priority + RARITY_SCORE[b.rarity || 'common'] + (b.weight || 0) * 1.8 + b.metricScore * 0.2;
    return bScore - aScore || b.priority - a.priority || b.metricScore - a.metricScore;
  });

  for (const candidate of scored) {
    if (finalInsights.length >= limit) break;
    if (usedTypes.has(candidate.type)) continue;

    let canUse = true;
    for (const participantId of candidate.participantIds) {
      if ((playerMentions.get(participantId) || 0) >= 2) {
        canUse = false;
        break;
      }
      const groups = playerGroups.get(participantId);
      if (groups?.has(candidate.group)) {
        canUse = false;
        break;
      }
    }

    if (!canUse) continue;
    finalInsights.push(candidate);
    usedTypes.add(candidate.type);
    candidate.participantIds.forEach(participantId => {
      playerMentions.set(participantId, (playerMentions.get(participantId) || 0) + 1);
      if (!playerGroups.has(participantId)) playerGroups.set(participantId, new Set());
      playerGroups.get(participantId)!.add(candidate.group);
    });
  }

  return finalInsights.map(candidate => ({
    type: candidate.type,
    title: candidate.title,
    text: candidate.text,
    playersInvolved: candidate.playersInvolved,
    rarity: candidate.rarity,
    weight: candidate.weight,
  }));
}

export function generateInsightsFromSnapshot(snapshot: AnalysisSnapshot): Insight[] {
  const candidates: InsightCandidate[] = [];
  addPlayerCandidates(candidates, snapshot);
  addPartnerCandidates(candidates, snapshot);
  addOpponentCandidates(candidates, snapshot);
  return selectInsights(candidates, 8);
}

export function generateAdvancedInsights(
  _board: unknown[],
  _elo: unknown,
  matches: AnalysisMatch[],
  players: AnalysisPlayer[],
  _matchExpected: unknown
): Insight[] {
  void _board;
  void _elo;
  void _matchExpected;
  return generateInsightsFromSnapshot(buildAnalysisSnapshot(players, matches));
}
