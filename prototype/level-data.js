// 由 scripts/build.mjs 生成，不要手改
window.LEVEL_DATA = {
  "id": "level-01",
  "title": "第一次训练赛",
  "titleEn": "First Practice Game",
  "scene": "校园球馆",
  "estimatedMinutes": 12,
  "goal": "完成两次经过沟通的配合，并在赛后介绍自己的一个选择",
  "reviewStatus": "草稿：英语自然度、难度、答案一致性待人工审定",
  "characters": {
    "coach": {
      "name": "Coach Lee",
      "role": "教练",
      "virtual": true,
      "color": "#f2a33a"
    },
    "alex": {
      "name": "Alex",
      "role": "组织后卫",
      "trait": "擅长传球",
      "number": 5,
      "virtual": true,
      "color": "#4fa3ff"
    },
    "ben": {
      "name": "Ben",
      "role": "得分手",
      "trait": "擅长投篮",
      "number": 9,
      "virtual": true,
      "color": "#3ccf91"
    },
    "mia": {
      "name": "Mia",
      "role": "校报小记者",
      "virtual": true,
      "color": "#e46fb0"
    },
    "opponents": {
      "name": "Red Hawks",
      "role": "对手（电脑角色）",
      "virtual": true,
      "color": "#e5534b"
    }
  },
  "targets": [
    {
      "id": "t_good_at",
      "text": "I'm good at ...",
      "meaningZh": "我擅长……",
      "isNew": false,
      "source": "Super Minds 3 能力表达（待对照版次）"
    },
    {
      "id": "t_pass_to",
      "text": "Pass to ...",
      "meaningZh": "传给……",
      "isNew": true,
      "source": "篮球任务"
    },
    {
      "id": "t_because",
      "text": "Because he is ...",
      "meaningZh": "因为他……",
      "isNew": true,
      "source": "日常通用表达"
    },
    {
      "id": "t_well",
      "text": "We ... well.",
      "meaningZh": "我们……得好",
      "isNew": true,
      "source": "日常通用表达"
    },
    {
      "id": "t_next_time",
      "text": "Next time, I want to ...",
      "meaningZh": "下次我想……",
      "isNew": true,
      "source": "日常通用表达"
    }
  ],
  "steps": [
    {
      "id": "s_intro",
      "type": "speak",
      "chapter": "进入球队",
      "chapterEn": "JOIN THE TEAM",
      "speaker": "coach",
      "line": "Hi! I'm Coach Lee. Welcome to the team. What are you good at?",
      "lineZh": "嗨！我是李教练。欢迎加入球队。你擅长什么？",
      "target": "t_good_at",
      "intents": [
        {
          "id": "good_at",
          "all": [
            [
              "good at",
              "i can",
              "i like",
              "i love",
              "best at",
              "great at",
              "i am a"
            ],
            [
              "pass",
              "passing",
              "passer",
              "shoot",
              "shooting",
              "shooter",
              "defend",
              "defending",
              "defense",
              "dribble",
              "dribbling",
              "run",
              "running",
              "rebound",
              "rebounding",
              "jump",
              "jumping"
            ]
          ],
          "keyword": [
            "passing",
            "pass",
            "shooting",
            "shoot",
            "defending",
            "defense",
            "dribbling",
            "running",
            "rebounding",
            "jumping"
          ],
          "slot": {
            "name": "skill",
            "map": {
              "pass": "passing",
              "passing": "passing",
              "passer": "passing",
              "shoot": "shooting",
              "shooting": "shooting",
              "shooter": "shooting",
              "defend": "defending",
              "defending": "defending",
              "defense": "defending",
              "dribble": "dribbling",
              "dribbling": "dribbling",
              "run": "running",
              "running": "running",
              "rebound": "rebounding",
              "rebounding": "rebounding",
              "jump": "jumping",
              "jumping": "jumping"
            },
            "default": "passing"
          },
          "reply": "{skill}? Great! Every team needs that.",
          "replyKeyword": "Oh, {skill}! Nice. You can say: I'm good at {skill}."
        }
      ],
      "ambiguous": [
        {
          "any": [
            "good",
            "i am good",
            "yes",
            "basketball"
          ],
          "clarify": "Good at what? Passing, shooting, or something else?"
        }
      ],
      "offTask": "Tell me one thing you can do well in basketball.",
      "hints": [
        {
          "level": 1,
          "label": "关键词",
          "words": [
            "good at",
            "passing",
            "shooting",
            "defending"
          ]
        },
        {
          "level": 2,
          "label": "句型",
          "pattern": "I'm good at ____."
        },
        {
          "level": 3,
          "label": "完整答案",
          "full": "I'm good at passing."
        }
      ],
      "followUp": {
        "when": "sentence",
        "line": "Cool. Why do you like {skill}?",
        "lineZh": "酷。你为什么喜欢{skillZh}？",
        "target": "t_because",
        "optional": true,
        "intents": [
          {
            "id": "reason",
            "all": [
              [
                "because",
                "it is",
                "it's",
                "fun",
                "help",
                "i like",
                "i love",
                "cool",
                "easy",
                "team",
                "score",
                "win"
              ]
            ],
            "keyword": [
              "fun",
              "cool",
              "easy"
            ],
            "reply": "That makes sense. Let's meet your team!",
            "replyKeyword": "Fun, yes! You can say: Because it is fun."
          }
        ],
        "offTask": "Just tell me one reason. It's OK to keep it short.",
        "hints": [
          {
            "level": 1,
            "label": "关键词",
            "words": [
              "because",
              "fun",
              "help my team"
            ]
          },
          {
            "level": 2,
            "label": "句型",
            "pattern": "Because it is ____."
          },
          {
            "level": 3,
            "label": "完整答案",
            "full": "Because it is fun."
          }
        ]
      }
    },
    {
      "id": "s_meet",
      "type": "listen",
      "chapter": "了解队友",
      "chapterEn": "MEET YOUR SQUAD",
      "target": "t_good_at",
      "messages": [
        {
          "from": "alex",
          "text": "Hi, I'm Alex. I'm good at passing.",
          "textZh": "嗨，我是 Alex。我擅长传球。"
        },
        {
          "from": "ben",
          "text": "Hey, I'm Ben. I'm good at shooting.",
          "textZh": "嘿，我是 Ben。我擅长投篮。"
        }
      ],
      "check": {
        "question": "谁擅长投篮？",
        "options": [
          "alex",
          "ben"
        ],
        "answer": "ben",
        "wrongReply": "再听一次 Ben 和 Alex 的消息？"
      }
    },
    {
      "id": "s_play1",
      "type": "court",
      "chapter": "第一次配合",
      "chapterEn": "FIRST PLAY",
      "situation": "你在三分线外持球。Ben 在左侧篮下没人防，Alex 在右侧也有空位。",
      "coachLine": "You have the ball. Tell your team the plan.",
      "coachLineZh": "球在你手上。把计划告诉队友。",
      "target": "t_pass_to",
      "positions": {
        "me": [
          50,
          66
        ],
        "alex": [
          82,
          44
        ],
        "ben": [
          16,
          26
        ],
        "o1": [
          50,
          50
        ],
        "o2": [
          66,
          36
        ],
        "o3": [
          38,
          16
        ]
      },
      "options": [
        {
          "id": "ben",
          "label": "传给 Ben",
          "why": "Ben 篮下空位，又擅长投篮",
          "result": "ben_shoots"
        },
        {
          "id": "alex",
          "label": "传给 Alex",
          "why": "Alex 有空位，擅长传球，可以再分给 Ben",
          "result": "alex_relay"
        }
      ],
      "intents": [
        {
          "id": "pass_to_ben",
          "option": "ben",
          "all": [
            [
              "pass",
              "past",
              "give",
              "throw",
              "passing"
            ],
            [
              "ben"
            ]
          ],
          "keyword": [
            "ben"
          ],
          "reply": "Got it! I'm open!",
          "replyKeyword": "Me? OK! Next time you can say: Pass to Ben.",
          "speaker": "ben"
        },
        {
          "id": "pass_to_alex",
          "option": "alex",
          "all": [
            [
              "pass",
              "past",
              "give",
              "throw",
              "passing"
            ],
            [
              "alex"
            ]
          ],
          "keyword": [
            "alex"
          ],
          "reply": "Sure! Ben, get ready!",
          "replyKeyword": "Me? OK! Next time you can say: Pass to Alex.",
          "speaker": "alex"
        }
      ],
      "redirects": [
        {
          "any": [
            "shoot",
            "i will shoot",
            "my shot"
          ],
          "reply": "You're far from the basket. Who is open?"
        }
      ],
      "ambiguous": [
        {
          "any": [
            "pass",
            "past",
            "give",
            "throw",
            "him",
            "to him"
          ],
          "clarify": "Pass to who? Ben or Alex?"
        }
      ],
      "offTask": "We need a plan. Who should get the ball?",
      "hints": [
        {
          "level": 1,
          "label": "关键词",
          "words": [
            "pass",
            "Ben",
            "Alex"
          ]
        },
        {
          "level": 2,
          "label": "句型",
          "pattern": "Pass to ____."
        },
        {
          "level": 3,
          "label": "完整答案",
          "full": "Pass to Ben."
        }
      ],
      "action": {
        "kind": "pass",
        "label": "传球"
      },
      "followUp": {
        "when": "sentence",
        "line": "Nice play! Why did you pick {optionName}?",
        "lineZh": "打得好！你为什么选{optionName}？",
        "target": "t_because",
        "optional": true,
        "intents": [
          {
            "id": "reason_play",
            "all": [
              [
                "because",
                "good at",
                "open",
                "free",
                "near",
                "close",
                "nobody",
                "no one",
                "shooter",
                "can shoot",
                "can pass"
              ]
            ],
            "keyword": [
              "open",
              "free",
              "shooting",
              "passing"
            ],
            "reply": "Smart choice.",
            "replyKeyword": "Yes! You can say: Because he is open."
          }
        ],
        "offTask": "Tell me one reason. Was he open? Is he good at something?",
        "hints": [
          {
            "level": 1,
            "label": "关键词",
            "words": [
              "because",
              "open",
              "good at shooting"
            ]
          },
          {
            "level": 2,
            "label": "句型",
            "pattern": "Because he is ____."
          },
          {
            "level": 3,
            "label": "完整答案",
            "full": "Because he is good at shooting."
          }
        ]
      }
    },
    {
      "id": "s_play2",
      "type": "court",
      "chapter": "暂停之后",
      "chapterEn": "TIME-OUT",
      "situation": "暂停！对手现在盯住了 Ben。Alex 在右侧空位，你离篮筐也近了，前面没人。",
      "coachLine": "Time-out! They are guarding Ben now. What's your plan?",
      "coachLineZh": "暂停！他们现在盯住 Ben 了。你的计划是什么？",
      "target": "t_pass_to",
      "positions": {
        "me": [
          46,
          42
        ],
        "alex": [
          84,
          32
        ],
        "ben": [
          18,
          24
        ],
        "o1": [
          30,
          13
        ],
        "o2": [
          30,
          33
        ],
        "o3": [
          62,
          60
        ]
      },
      "options": [
        {
          "id": "alex",
          "label": "传给 Alex",
          "why": "Alex 右侧空位",
          "result": "alex_shoots"
        },
        {
          "id": "me",
          "label": "自己投",
          "why": "你离篮筐近，前面没人防",
          "result": "me_shoots"
        }
      ],
      "intents": [
        {
          "id": "pass_to_alex",
          "option": "alex",
          "all": [
            [
              "pass",
              "past",
              "give",
              "throw",
              "passing"
            ],
            [
              "alex"
            ]
          ],
          "keyword": [
            "alex"
          ],
          "reply": "I'm open! Pass it!",
          "replyKeyword": "OK! You can say: Pass to Alex.",
          "speaker": "alex"
        },
        {
          "id": "i_shoot",
          "option": "me",
          "all": [
            [
              "i will shoot",
              "i shoot",
              "i can shoot",
              "let me shoot",
              "i want to shoot",
              "i will take",
              "my shot",
              "i am open",
              "shoot"
            ]
          ],
          "keyword": [
            "shoot",
            "me"
          ],
          "reply": "Go for it! We'll get the rebound!",
          "replyKeyword": "Shoot? Go! You can say: I can shoot.",
          "speaker": "alex"
        }
      ],
      "redirects": [
        {
          "any": [
            "ben"
          ],
          "reply": "Ben is covered now. Look again. Who is open?"
        }
      ],
      "ambiguous": [
        {
          "any": [
            "pass",
            "past",
            "give",
            "throw",
            "him",
            "to him"
          ],
          "clarify": "Pass to who? Ben is covered. Alex?"
        }
      ],
      "offTask": "The defense changed. Who is open now?",
      "hints": [
        {
          "level": 1,
          "label": "关键词",
          "words": [
            "Alex",
            "open",
            "shoot"
          ]
        },
        {
          "level": 2,
          "label": "句型",
          "pattern": "Pass to ____. / I can ____."
        },
        {
          "level": 3,
          "label": "完整答案",
          "full": "Pass to Alex."
        }
      ],
      "action": {
        "kind": "pass_or_shoot",
        "label": "出手"
      }
    },
    {
      "id": "s_interview1",
      "type": "speak",
      "chapter": "赛后采访",
      "chapterEn": "POST-GAME",
      "speaker": "mia",
      "line": "Hi, I'm Mia from the school news. Great game! Which play worked well?",
      "lineZh": "嗨，我是校报的 Mia。打得真好！哪次配合效果好？",
      "target": "t_well",
      "intents": [
        {
          "id": "worked_well",
          "all": [
            [
              "pass",
              "passed",
              "passing",
              "shot",
              "shoot",
              "play",
              "played",
              "teamwork",
              "worked",
              "well",
              "good",
              "great",
              "ben",
              "alex",
              "together"
            ]
          ],
          "keyword": [
            "pass",
            "passing",
            "teamwork",
            "ben",
            "alex"
          ],
          "reply": "Wow. That sounds like real teamwork.",
          "replyKeyword": "Teamwork! You can say: We passed the ball well."
        }
      ],
      "offTask": "Just tell me about one good moment in the game.",
      "hints": [
        {
          "level": 1,
          "label": "关键词",
          "words": [
            "passed",
            "the ball",
            "well"
          ]
        },
        {
          "level": 2,
          "label": "句型",
          "pattern": "We ____ the ball well."
        },
        {
          "level": 3,
          "label": "完整答案",
          "full": "We passed the ball well."
        }
      ]
    },
    {
      "id": "s_interview2",
      "type": "speak",
      "chapter": "赛后采访",
      "chapterEn": "POST-GAME",
      "speaker": "mia",
      "line": "What do you want to do better next time?",
      "lineZh": "下次你想把什么做得更好？",
      "target": "t_next_time",
      "intents": [
        {
          "id": "next_goal",
          "all": [
            [
              "next time",
              "want to",
              "i will",
              "i want",
              "better",
              "more",
              "practice",
              "try",
              "learn",
              "improve"
            ]
          ],
          "keyword": [
            "shoot",
            "shooting",
            "pass",
            "passing",
            "defend",
            "defense",
            "run",
            "dribble"
          ],
          "reply": "Good goal! See you at the next practice.",
          "replyKeyword": "Nice goal! You can say: Next time, I want to shoot better."
        }
      ],
      "offTask": "Tell me one thing you want to practice.",
      "hints": [
        {
          "level": 1,
          "label": "关键词",
          "words": [
            "next time",
            "want to",
            "better"
          ]
        },
        {
          "level": 2,
          "label": "句型",
          "pattern": "Next time, I want to ____ better."
        },
        {
          "level": 3,
          "label": "完整答案",
          "full": "Next time, I want to shoot better."
        }
      ]
    },
    {
      "id": "s_feedback",
      "type": "feedback",
      "chapter": "收尾"
    },
    {
      "id": "s_reward",
      "type": "reward",
      "chapter": "收尾",
      "chapterEn": "WRAP-UP",
      "reward": {
        "id": "r_level01_jersey",
        "label": "第一套队服",
        "numbers": [
          3,
          7,
          8,
          11,
          13,
          23,
          24,
          30
        ],
        "colors": [
          {
            "id": "navy",
            "label": "深蓝",
            "hex": "#24408e"
          },
          {
            "id": "red",
            "label": "红",
            "hex": "#c8372d"
          },
          {
            "id": "black",
            "label": "黑",
            "hex": "#22252b"
          },
          {
            "id": "green",
            "label": "绿",
            "hex": "#1f8a5b"
          }
        ]
      }
    }
  ],
  "abilities": [
    {
      "id": "a_intro",
      "label": "会介绍自己擅长什么",
      "target": "t_good_at"
    },
    {
      "id": "a_plan",
      "label": "会提出配合",
      "target": "t_pass_to"
    },
    {
      "id": "a_reason",
      "label": "会解释选择",
      "target": "t_because"
    },
    {
      "id": "a_goal",
      "label": "会说下次目标",
      "target": "t_next_time"
    }
  ],
  "endCondition": "两次球场配合都有沟通（含看答案或点击继续，剧情照常推进）＋两段采访＋领取队服"
};
