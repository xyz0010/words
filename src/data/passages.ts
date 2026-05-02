import { Passage } from '../types/practice';

export const passages: Passage[] = [
  {
    id: 'morning-routine',
    title: 'A Calm Morning',
    level: '入门',
    topic: '日常生活',
    description: '从起床到出门的简单晨间流程，适合熟悉常见日常表达。',
    source: 'builtin',
    sentences: [
      {
        sentence: 'Emma wakes up at six thirty every morning.',
        translation: 'Emma 每天早上六点半起床。',
      },
      {
        sentence: 'She opens the window and takes a deep breath.',
        translation: '她打开窗户，深深吸了一口气。',
      },
      {
        sentence: 'After that, she makes a quick breakfast in the kitchen.',
        translation: '之后，她在厨房里快速做一份早餐。',
      },
      {
        sentence: 'Before leaving home, she checks her bag and smiles at the mirror.',
        translation: '出门前，她检查书包，并对着镜子笑了笑。',
      },
    ],
  },
  {
    id: 'library-afternoon',
    title: 'An Afternoon At The Library',
    level: '进阶',
    topic: '学习场景',
    description: '围绕图书馆学习展开，句子稍长一些，适合逐句输入训练。',
    source: 'builtin',
    sentences: [
      {
        sentence: 'Kevin spends most Saturday afternoons at the public library near his apartment.',
        translation: 'Kevin 大多数周六下午都会待在公寓附近的公共图书馆。',
      },
      {
        sentence: 'He usually chooses a seat by the window because the natural light helps him stay focused.',
        translation: '他通常会选择靠窗的位置，因为自然光能帮助他保持专注。',
      },
      {
        sentence: 'When he feels tired, he walks to the first floor and buys a cup of hot tea.',
        translation: '当他感到疲惫时，他会走到一楼买一杯热茶。',
      },
      {
        sentence: 'By the time he goes home, he often finishes more work than he expected.',
        translation: '等到他回家时，他常常比预想中完成了更多任务。',
      },
    ],
  },
  {
    id: 'weekend-hike',
    title: 'A Weekend Hike',
    level: '进阶',
    topic: '户外活动',
    description: '描述一次轻松的周末徒步，包含天气、动作和感受表达。',
    source: 'builtin',
    sentences: [
      {
        sentence: 'The weather was cool and clear when we arrived at the mountain trail.',
        translation: '当我们到达山路步道时，天气凉爽而晴朗。',
      },
      {
        sentence: 'We walked slowly at first, listening to birds and the sound of water between the rocks.',
        translation: '起初我们慢慢地走，听着鸟叫和岩石间的水流声。',
      },
      {
        sentence: 'Halfway up the hill, we stopped to rest and share sandwiches from our backpacks.',
        translation: '走到半山腰时，我们停下来休息，并分吃背包里的三明治。',
      },
      {
        sentence: 'Although the climb was tiring, the view from the top made every step worth it.',
        translation: '虽然爬山很累，但山顶的风景让每一步都变得值得。',
      },
    ],
  },
];
