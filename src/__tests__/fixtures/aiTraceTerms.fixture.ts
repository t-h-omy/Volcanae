import type { GameState } from '../../types';
import type { ScoredAction } from '../../enemySystem';

export const EXPECTED_COMPUTE_UNIT_AI_SCORES: ScoredAction[] = [
  {
    "type": "DEFEND_ENEMY_BUILDING",
    "score": 129,
    "targetBuildingId": "building_WATCHTOWER_4",
    "targetPosition": {
      "x": 6,
      "y": 8
    }
  },
  {
    "type": "RANGED_ATTACK_UNIT",
    "score": 105,
    "targetUnitId": "unit_SWORDSMAN_PLAYER_3",
    "targetPosition": {
      "x": 8,
      "y": 6
    }
  },
  {
    "type": "RANGED_ATTACK_BUILDING",
    "score": 104,
    "targetBuildingId": "building_WATCHTOWER_5",
    "targetPosition": {
      "x": 8,
      "y": 8
    }
  },
  {
    "type": "MOVE_TO_PLAYER_BUILDING",
    "score": 89,
    "targetBuildingId": "building_WATCHTOWER_5",
    "targetPosition": {
      "x": 8,
      "y": 8
    }
  },
  {
    "type": "BUILD_INFERNAL_SANCTUM",
    "score": 77,
    "targetPosition": {
      "x": 7,
      "y": 7
    }
  },
  {
    "type": "BUILD_LAVA_LAIR",
    "score": 72,
    "targetPosition": {
      "x": 6,
      "y": 7
    }
  },
  {
    "type": "ATTACK_UNIT",
    "score": 67,
    "targetUnitId": "unit_ARCHER_PLAYER_2",
    "targetPosition": {
      "x": 7,
      "y": 6
    }
  },
  {
    "type": "ATTACK_BUILDING",
    "score": 60,
    "targetBuildingId": "building_WATCHTOWER_5",
    "targetPosition": {
      "x": 8,
      "y": 8
    }
  },
  {
    "type": "MOVE_TO_NEUTRAL_BUILDING",
    "score": 22,
    "targetBuildingId": "building_OUTPOST_6",
    "targetPosition": {
      "x": 6,
      "y": 4
    }
  },
  {
    "type": "ADVANCE_TOWARD_LAVA",
    "score": 18,
    "targetPosition": {
      "x": 6,
      "y": 12
    }
  },
  {
    "type": "HOLD_POSITION",
    "score": 3
  }
];

export const EXPECTED_ENEMY_TURN_FINAL_STATE: GameState = {
  "turn": 9,
  "phase": "PLAYER_TURN",
  "grid": [
    [
      {
        "position": {
          "x": 0,
          "y": 0
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 0
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 0
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 0
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 0
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 0
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 0
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 0
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 0
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 1
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 1
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 1
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 1
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 1
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 1
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 1
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 1
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 1
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 2
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 2
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 2
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 2
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 2
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 2
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 2
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 2
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 2
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 3
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 3
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 3
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": true,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 3
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 3
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": true,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 3
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 3
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 3
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 3
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 4
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 4
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 4
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 4
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": true,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 4
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 4
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 4
        },
        "isRevealed": true,
        "buildingId": "building_OUTPOST_10",
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 4
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 4
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 5
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 5
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 5
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 5
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 5
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 5
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 5
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 5
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 5
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 6
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 6
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 6
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 6
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 6
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 6
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "FOREST",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 6
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": "unit_LAVA_ARCHER_ENEMY_1",
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 6
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": "unit_ARCHER_PLAYER_4",
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 6
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": "unit_SWORDSMAN_PLAYER_5",
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 7
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 7
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 7
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 7
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 7
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 7
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 7
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": true,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 7
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": true,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 7
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 8
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 8
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 8
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 8
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 8
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 8
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 8
        },
        "isRevealed": true,
        "buildingId": "building_WATCHTOWER_7",
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 8
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 8
        },
        "isRevealed": true,
        "buildingId": "building_WATCHTOWER_9",
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 9
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 9
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 9
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 9
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 9
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 9
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": "unit_LAVA_GRUNT_ENEMY_2",
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 9
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 9
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 9
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 10
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 10
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 10
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 10
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 10
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 10
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 10
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 10
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 10
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 11
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 11
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 11
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 11
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 11
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": "unit_SPEARMAN_PLAYER_6",
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 11
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 11
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 11
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 11
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 12
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 12
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 12
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 12
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 12
        },
        "isRevealed": true,
        "buildingId": "building_LAVALAIR_8",
        "unitId": "enemy_unit_1790708367414_1",
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 12
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 12
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 12
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 12
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 13
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 13
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 13
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 13
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 13
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 13
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 13
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 13
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 13
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 14
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 14
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 14
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 14
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 14
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 14
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 14
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 14
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 14
        },
        "isRevealed": true,
        "buildingId": "building_STRONGHOLD_11",
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 15
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 15
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 15
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 15
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 15
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 15
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 15
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 15
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 15
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 16
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 16
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 16
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 16
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 16
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 16
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 16
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 16
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 16
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 17
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 17
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 17
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 17
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 17
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 17
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 17
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 17
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 17
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 18
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 18
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 18
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 18
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 18
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 18
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 18
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 18
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 18
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 19
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 19
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 19
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 19
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 19
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 19
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 19
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 19
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 19
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 20
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 20
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 20
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 20
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 20
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 20
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 20
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 20
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 20
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 21
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 21
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 21
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 21
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 21
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 21
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 21
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 21
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 21
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 22
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 22
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 22
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 22
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 22
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 22
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 22
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 22
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 22
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 23
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 23
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 23
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 23
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 23
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 23
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 23
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 23
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 23
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 24
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 24
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 24
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 24
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 24
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 24
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 24
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 24
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 24
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 25
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 25
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 25
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 25
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 25
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 25
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 25
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 25
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 25
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 26
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 26
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 26
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 26
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 26
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 26
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 26
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 26
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 26
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 27
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 27
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 27
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 27
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 27
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 27
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 27
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 27
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 27
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 28
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 28
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 28
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 28
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 28
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 28
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 28
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 28
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 28
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 29
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 29
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 29
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 29
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 29
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 29
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 29
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 29
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 29
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 30
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 30
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 30
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 30
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 30
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 30
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 30
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 30
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 30
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 31
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 31
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 31
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 31
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 31
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 31
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 31
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 31
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 31
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 32
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 32
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 32
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 32
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 32
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 32
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 32
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 32
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 32
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 33
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 33
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 33
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 33
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 33
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 33
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 33
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 33
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 33
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 34
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 34
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 34
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 34
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 34
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 34
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 34
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 34
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 34
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 35
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 35
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 35
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 35
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 35
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 35
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 35
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 35
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 35
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 36
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 36
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 36
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 36
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 36
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 36
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 36
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 36
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 36
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 37
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 37
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 37
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 37
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 37
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 37
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 37
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 37
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 37
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 38
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 38
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 38
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 38
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 38
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 38
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 38
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 38
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 38
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 39
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 39
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 39
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 39
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 39
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 39
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 39
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 39
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 39
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 40
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 40
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 40
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 40
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 40
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 40
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 40
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 40
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 40
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 41
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 41
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 41
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 41
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 41
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 41
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 41
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 41
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 41
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 42
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 42
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 42
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 42
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 42
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 42
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 42
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 42
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 42
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 43
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 43
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 43
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 43
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 43
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 43
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 43
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 43
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 43
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 44
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 44
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 44
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 44
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 44
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 44
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 44
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 44
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 44
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 45
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 45
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 45
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 45
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 45
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 45
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 45
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 45
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 45
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 46
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 46
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 46
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 46
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 46
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 46
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 46
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 46
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 46
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 47
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 47
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 47
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 47
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 47
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 47
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 47
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 47
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 47
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 48
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 48
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 48
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 48
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 48
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 48
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 48
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 48
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 48
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 49
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 49
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 49
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 49
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 49
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 49
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 49
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 49
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 49
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 50
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 50
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 50
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 50
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 50
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 50
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 50
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 50
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 50
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 51
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 51
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 51
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 51
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 51
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 51
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 51
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 51
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 51
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 52
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 52
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 52
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 52
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 52
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 52
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 52
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 52
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 52
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 53
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 53
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 53
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 53
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 53
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 53
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 53
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 53
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 53
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 54
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 54
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 54
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 54
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 54
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 54
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 54
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 54
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 54
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 55
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 55
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 55
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 55
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 55
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 55
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 55
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 55
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 55
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 56
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 56
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 56
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 56
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 56
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 56
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 56
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 56
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 56
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 57
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 57
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 57
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 57
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 57
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 57
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 57
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 57
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 57
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 58
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 58
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 58
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 58
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 58
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 58
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 58
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 58
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 58
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 59
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 59
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 59
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 59
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 59
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 59
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 59
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 59
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 59
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 60
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 60
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 60
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 60
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 60
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 60
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 60
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 60
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 60
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 61
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 61
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 61
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 61
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 61
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 61
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 61
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 61
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 61
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 62
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 62
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 62
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 62
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 62
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 62
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 62
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 62
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 62
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 63
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 63
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 63
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 63
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 63
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 63
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 63
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 63
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 63
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 64
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 64
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 64
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 64
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 64
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 64
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 64
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 64
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 64
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 65
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 65
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 65
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 65
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 65
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 65
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 65
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 65
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 65
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 66
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 66
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 66
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 66
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 66
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 66
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 66
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 66
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 66
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 67
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 67
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 67
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 67
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 67
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 67
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 67
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 67
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 67
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 68
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 68
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 68
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 68
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 68
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 68
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 68
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 68
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 68
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 69
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 69
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 69
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 69
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 69
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 69
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 69
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 69
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 69
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 70
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 70
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 70
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 70
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 70
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 70
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 70
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 70
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 70
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 71
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 71
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 71
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 71
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 71
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 71
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 71
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 71
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 71
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 72
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 72
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 72
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 72
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 72
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 72
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 72
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 72
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 72
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 73
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 73
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 73
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 73
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 73
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 73
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 73
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 73
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 73
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 74
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 74
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 74
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 74
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 74
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 74
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 74
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 74
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 74
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ],
    [
      {
        "position": {
          "x": 0,
          "y": 75
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 1,
          "y": 75
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 2,
          "y": 75
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 3,
          "y": 75
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 4,
          "y": 75
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 5,
          "y": 75
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 6,
          "y": 75
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 7,
          "y": 75
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      },
      {
        "position": {
          "x": 8,
          "y": 75
        },
        "isRevealed": true,
        "buildingId": null,
        "unitId": null,
        "isLava": false,
        "isLavaPreview": false,
        "isRuin": false,
        "isStrongholdRuin": false,
        "terrainType": "PLAINS",
        "status": null,
        "hasCaveMonster": false
      }
    ]
  ],
  "units": {
    "unit_LAVA_ARCHER_ENEMY_1": {
      "id": "unit_LAVA_ARCHER_ENEMY_1",
      "type": "LAVA_ARCHER",
      "faction": "ENEMY",
      "position": {
        "x": 6,
        "y": 6
      },
      "stats": {
        "maxHp": 100,
        "currentHp": 100,
        "attack": 55,
        "defense": 20,
        "moveRange": 1,
        "discoverRadius": 1,
        "triggerRange": 3,
        "movementActions": 1,
        "attackRange": 2
      },
      "tags": [
        "BUILDANDCAPTURE",
        "RANGED",
        "LAVA"
      ],
      "hasMovedThisTurn": false,
      "hasAttackedThisTurn": false,
      "hasConstructedThisTurn": false,
      "hasDestroyedThisTurn": false,
      "hasCapturedThisTurn": false,
      "hasTradedThisTurn": false,
      "hasUsedPostAttackMoveThisTurn": false,
      "bloodlustAttackAvailable": false,
      "xp": 0,
      "level": 1,
      "pinnedUntilTurn": 0,
      "distractionDefPenalty": 0,
      "lastMovedTurn": 0,
      "spellsCastThisTurn": 0
    },
    "unit_LAVA_GRUNT_ENEMY_2": {
      "id": "unit_LAVA_GRUNT_ENEMY_2",
      "type": "LAVA_GRUNT",
      "faction": "ENEMY",
      "position": {
        "x": 5,
        "y": 9
      },
      "stats": {
        "maxHp": 100,
        "currentHp": 100,
        "attack": 50,
        "defense": 45,
        "moveRange": 1,
        "discoverRadius": 1,
        "triggerRange": 3,
        "movementActions": 1,
        "attackRange": 1
      },
      "tags": [
        "BUILDANDCAPTURE",
        "CORRUPT",
        "LAVA"
      ],
      "hasMovedThisTurn": false,
      "hasAttackedThisTurn": false,
      "hasConstructedThisTurn": false,
      "hasDestroyedThisTurn": false,
      "hasCapturedThisTurn": false,
      "hasTradedThisTurn": false,
      "hasUsedPostAttackMoveThisTurn": false,
      "bloodlustAttackAvailable": false,
      "xp": 0,
      "level": 1,
      "pinnedUntilTurn": 0,
      "distractionDefPenalty": 0,
      "lastMovedTurn": 0,
      "spellsCastThisTurn": 0
    },
    "unit_ARCHER_PLAYER_4": {
      "id": "unit_ARCHER_PLAYER_4",
      "type": "ARCHER",
      "faction": "PLAYER",
      "position": {
        "x": 7,
        "y": 6
      },
      "stats": {
        "maxHp": 90,
        "currentHp": 56,
        "attack": 50,
        "defense": 35,
        "moveRange": 1,
        "discoverRadius": 1,
        "triggerRange": 0,
        "movementActions": 1,
        "attackRange": 2
      },
      "tags": [
        "RANGED",
        "BUILDANDCAPTURE"
      ],
      "hasMovedThisTurn": false,
      "hasAttackedThisTurn": false,
      "hasConstructedThisTurn": false,
      "hasDestroyedThisTurn": false,
      "hasCapturedThisTurn": false,
      "hasTradedThisTurn": false,
      "hasUsedPostAttackMoveThisTurn": false,
      "bloodlustAttackAvailable": false,
      "xp": 0,
      "level": 1,
      "pinnedUntilTurn": 0,
      "distractionDefPenalty": 0,
      "lastMovedTurn": 0,
      "spellsCastThisTurn": 0
    },
    "unit_SWORDSMAN_PLAYER_5": {
      "id": "unit_SWORDSMAN_PLAYER_5",
      "type": "SWORDSMAN",
      "faction": "PLAYER",
      "position": {
        "x": 8,
        "y": 6
      },
      "stats": {
        "maxHp": 120,
        "currentHp": 92,
        "attack": 60,
        "defense": 55,
        "moveRange": 1,
        "discoverRadius": 1,
        "triggerRange": 0,
        "movementActions": 1,
        "attackRange": 1
      },
      "tags": [
        "BUILDANDCAPTURE"
      ],
      "hasMovedThisTurn": false,
      "hasAttackedThisTurn": false,
      "hasConstructedThisTurn": false,
      "hasDestroyedThisTurn": false,
      "hasCapturedThisTurn": false,
      "hasTradedThisTurn": false,
      "hasUsedPostAttackMoveThisTurn": false,
      "bloodlustAttackAvailable": false,
      "xp": 0,
      "level": 1,
      "pinnedUntilTurn": 0,
      "distractionDefPenalty": 0,
      "lastMovedTurn": 0,
      "spellsCastThisTurn": 0
    },
    "unit_SPEARMAN_PLAYER_6": {
      "id": "unit_SPEARMAN_PLAYER_6",
      "type": "SPEARMAN",
      "faction": "PLAYER",
      "position": {
        "x": 4,
        "y": 11
      },
      "stats": {
        "maxHp": 100,
        "currentHp": 100,
        "attack": 45,
        "defense": 45,
        "moveRange": 1,
        "discoverRadius": 1,
        "triggerRange": 0,
        "movementActions": 1,
        "attackRange": 1
      },
      "tags": [
        "BUILDANDCAPTURE"
      ],
      "hasMovedThisTurn": false,
      "hasAttackedThisTurn": false,
      "hasConstructedThisTurn": false,
      "hasDestroyedThisTurn": false,
      "hasCapturedThisTurn": false,
      "hasTradedThisTurn": false,
      "hasUsedPostAttackMoveThisTurn": false,
      "bloodlustAttackAvailable": false,
      "xp": 0,
      "level": 1,
      "pinnedUntilTurn": 0,
      "distractionDefPenalty": 0,
      "lastMovedTurn": 0,
      "spellsCastThisTurn": 0
    },
    "enemy_unit_1790708367414_1": {
      "id": "enemy_unit_1790708367414_1",
      "type": "LAVA_GRUNT",
      "faction": "ENEMY",
      "position": {
        "x": 4,
        "y": 12
      },
      "stats": {
        "maxHp": null,
        "currentHp": null,
        "attack": null,
        "defense": null,
        "moveRange": 1,
        "discoverRadius": 1,
        "triggerRange": 3,
        "movementActions": 1,
        "attackRange": 1
      },
      "tags": [
        "BUILDANDCAPTURE",
        "CORRUPT",
        "LAVA"
      ],
      "hasMovedThisTurn": false,
      "hasAttackedThisTurn": false,
      "hasCapturedThisTurn": false,
      "hasTradedThisTurn": false,
      "hasConstructedThisTurn": false,
      "hasDestroyedThisTurn": false,
      "hasUsedPostAttackMoveThisTurn": false,
      "bloodlustAttackAvailable": false,
      "xp": 0,
      "level": 1,
      "pinnedUntilTurn": 0,
      "distractionDefPenalty": 0,
      "lastMovedTurn": 0,
      "spellsCastThisTurn": 0
    }
  },
  "buildings": {
    "building_WATCHTOWER_7": {
      "id": "building_WATCHTOWER_7",
      "type": "WATCHTOWER",
      "faction": "ENEMY",
      "position": {
        "x": 6,
        "y": 8
      },
      "hp": 136,
      "maxHp": 150,
      "specialistSlot": null,
      "isDisabledForTurns": 0,
      "wasAttackedLastEnemyTurn": false,
      "captureProgress": 0,
      "isBeingCapturedBy": null,
      "lavaBoostEnabled": false,
      "discoverRadius": 4,
      "turnCapturedByPlayer": null,
      "wasEnemyOwnedBeforeCapture": false,
      "combatStats": {
        "maxHp": 150,
        "attack": 55,
        "defense": 55,
        "attackRange": 3
      },
      "hasAttackedThisTurn": false,
      "tags": [],
      "consumesUnitOnCapture": false,
      "populationCount": 0,
      "populationCap": 0,
      "populationGrowthCounter": 0,
      "strongholdNobles": 0,
      "emberSpawnCounter": 0,
      "recruitmentQueue": null,
      "destroyBehavior": "RUIN",
      "resonanceTurnsRemaining": 0,
      "spawnCooldownRemaining": 0,
      "lastRecruitmentTurn": 0,
      "preventiveStrikeFiredThisTurn": false
    },
    "building_LAVALAIR_8": {
      "id": "building_LAVALAIR_8",
      "type": "LAVALAIR",
      "faction": "ENEMY",
      "position": {
        "x": 4,
        "y": 12
      },
      "hp": 100,
      "maxHp": 100,
      "specialistSlot": null,
      "isDisabledForTurns": 0,
      "wasAttackedLastEnemyTurn": false,
      "captureProgress": 0,
      "isBeingCapturedBy": null,
      "lavaBoostEnabled": false,
      "discoverRadius": 2,
      "turnCapturedByPlayer": null,
      "wasEnemyOwnedBeforeCapture": false,
      "combatStats": null,
      "hasAttackedThisTurn": false,
      "tags": [],
      "consumesUnitOnCapture": false,
      "populationCount": 0,
      "populationCap": 0,
      "populationGrowthCounter": 0,
      "strongholdNobles": 0,
      "emberSpawnCounter": 0,
      "recruitmentQueue": null,
      "destroyBehavior": "RUIN",
      "resonanceTurnsRemaining": 0,
      "spawnCooldownRemaining": 0,
      "lastRecruitmentTurn": 0,
      "preventiveStrikeFiredThisTurn": false
    },
    "building_WATCHTOWER_9": {
      "id": "building_WATCHTOWER_9",
      "type": "WATCHTOWER",
      "faction": "PLAYER",
      "position": {
        "x": 8,
        "y": 8
      },
      "hp": 150,
      "maxHp": 150,
      "specialistSlot": null,
      "isDisabledForTurns": 0,
      "wasAttackedLastEnemyTurn": false,
      "captureProgress": 0,
      "isBeingCapturedBy": null,
      "lavaBoostEnabled": false,
      "discoverRadius": 4,
      "turnCapturedByPlayer": null,
      "wasEnemyOwnedBeforeCapture": false,
      "combatStats": {
        "maxHp": 150,
        "attack": 55,
        "defense": 55,
        "attackRange": 3
      },
      "hasAttackedThisTurn": false,
      "tags": [],
      "consumesUnitOnCapture": false,
      "populationCount": 0,
      "populationCap": 0,
      "populationGrowthCounter": 0,
      "strongholdNobles": 0,
      "emberSpawnCounter": 0,
      "recruitmentQueue": null,
      "destroyBehavior": "RUIN",
      "resonanceTurnsRemaining": 0,
      "spawnCooldownRemaining": 0,
      "lastRecruitmentTurn": 0,
      "preventiveStrikeFiredThisTurn": false
    },
    "building_OUTPOST_10": {
      "id": "building_OUTPOST_10",
      "type": "OUTPOST",
      "faction": null,
      "position": {
        "x": 6,
        "y": 4
      },
      "hp": 200,
      "maxHp": 200,
      "specialistSlot": null,
      "isDisabledForTurns": 0,
      "wasAttackedLastEnemyTurn": false,
      "captureProgress": 0,
      "isBeingCapturedBy": null,
      "lavaBoostEnabled": false,
      "discoverRadius": 3,
      "turnCapturedByPlayer": null,
      "wasEnemyOwnedBeforeCapture": false,
      "combatStats": {
        "maxHp": 200,
        "attack": 55,
        "defense": 50,
        "attackRange": 2
      },
      "hasAttackedThisTurn": false,
      "tags": [],
      "consumesUnitOnCapture": false,
      "populationCount": 0,
      "populationCap": 0,
      "populationGrowthCounter": 0,
      "strongholdNobles": 0,
      "emberSpawnCounter": 0,
      "recruitmentQueue": null,
      "destroyBehavior": "NONE",
      "resonanceTurnsRemaining": 0,
      "spawnCooldownRemaining": 0,
      "lastRecruitmentTurn": 0,
      "preventiveStrikeFiredThisTurn": false
    },
    "building_STRONGHOLD_11": {
      "id": "building_STRONGHOLD_11",
      "type": "STRONGHOLD",
      "faction": "PLAYER",
      "position": {
        "x": 8,
        "y": 14
      },
      "hp": 100,
      "maxHp": 100,
      "specialistSlot": null,
      "isDisabledForTurns": 0,
      "wasAttackedLastEnemyTurn": false,
      "captureProgress": 0,
      "isBeingCapturedBy": null,
      "lavaBoostEnabled": false,
      "discoverRadius": 2,
      "turnCapturedByPlayer": null,
      "wasEnemyOwnedBeforeCapture": false,
      "combatStats": null,
      "hasAttackedThisTurn": false,
      "tags": [],
      "consumesUnitOnCapture": false,
      "populationCount": 0,
      "populationCap": 0,
      "populationGrowthCounter": 0,
      "strongholdNobles": 0,
      "emberSpawnCounter": 0,
      "recruitmentQueue": null,
      "destroyBehavior": "STRONGHOLD_RUIN",
      "resonanceTurnsRemaining": 0,
      "spawnCooldownRemaining": 0,
      "lastRecruitmentTurn": 0,
      "preventiveStrikeFiredThisTurn": false
    }
  },
  "specialists": {
    "spec_01": {
      "id": "spec_01",
      "name": "Garrison Commander",
      "description": "All your Watchtowers, Outposts, and Crystal Towers gain +15 attack and +1 attack range.",
      "effects": [
        {
          "type": "FORTIFIED_GARRISON",
          "params": {}
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_02": {
      "id": "spec_02",
      "name": "Bloodrider",
      "description": "When one of your Riders kills an enemy, it may attack once more this turn at half attack and without retaliation.",
      "effects": [
        {
          "type": "GRANT_UNIT_TAG_ALL",
          "params": {
            "unitType": "RIDER",
            "tag": "BLOODLUST"
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_03": {
      "id": "spec_03",
      "name": "Siege Tactician",
      "description": "Your Siege units deal 25% of their damage to all enemy units surrounding their target.",
      "effects": [
        {
          "type": "GRANT_UNIT_TAG_ALL",
          "params": {
            "unitType": "SIEGE",
            "tag": "SPLASH"
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_04": {
      "id": "spec_04",
      "name": "Drill Sergeant",
      "description": "Your Spearman and Swordsman units can move and attack immediately after being recruited.",
      "effects": [
        {
          "type": "GRANT_UNIT_TAG_ALL",
          "params": {
            "unitType": "SPEARMAN",
            "tag": "READY"
          }
        },
        {
          "type": "GRANT_UNIT_TAG_ALL",
          "params": {
            "unitType": "SWORDSMAN",
            "tag": "READY"
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_05": {
      "id": "spec_05",
      "name": "Deathmender",
      "description": "When one of your Spearmen, Scouts, or Guards dies, a Gravestone is left on their tile. Pay 1 crystal to raise a flying Gargoyle from any Gravestone.",
      "effects": [
        {
          "type": "GRANT_UNIT_TAG_ALL",
          "params": {
            "unitType": "SPEARMAN",
            "tag": "LEAVES_GRAVESTONE"
          }
        },
        {
          "type": "GRANT_UNIT_TAG_ALL",
          "params": {
            "unitType": "SCOUT",
            "tag": "LEAVES_GRAVESTONE"
          }
        },
        {
          "type": "GRANT_UNIT_TAG_ALL",
          "params": {
            "unitType": "GUARD",
            "tag": "LEAVES_GRAVESTONE"
          }
        },
        {
          "type": "RAISE_GARGOYLE",
          "params": {}
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_06": {
      "id": "spec_06",
      "name": "Archmage",
      "description": "Your Mages can cast 2 spells per turn instead of 1.",
      "effects": [
        {
          "type": "MAGE_CAST_BUDGET_MOD",
          "params": {
            "amount": 1
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_07": {
      "id": "spec_07",
      "name": "Ashwright",
      "description": "Your Charcoal Kilns affect mines and deep mines within 3 tiles instead of 2.",
      "effects": [
        {
          "type": "KILN_BONUS",
          "params": {
            "radiusBonus": 1,
            "ironBonus": 0
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_08": {
      "id": "spec_08",
      "name": "Trapsmith",
      "description": "Your Scouts can place a Scout Trap within 1 tile(s) of their position (costs 4 wood). The next non-FLYING enemy to enter it takes 60 damage and is stunned for 1 turn(s).",
      "effects": [
        {
          "type": "SCOUT_SET_TRAP",
          "params": {
            "woodCost": 4,
            "ironCost": 0,
            "damage": 60,
            "stunTurns": 1
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_09": {
      "id": "spec_09",
      "name": "Watch Captain",
      "description": "Your garrisoned Watchtowers, Outposts, and Crystal Towers fire a preventive shot at 50% damage when an enemy enters their range.",
      "effects": [
        {
          "type": "GARRISON_OVERWATCH",
          "params": {}
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_10": {
      "id": "spec_10",
      "name": "Cinder Warden",
      "description": "Your Scouts can extinguish BURNING and CORRUPTED tiles within 1 tile(s), consuming their action.",
      "effects": [
        {
          "type": "SCOUT_EXTINGUISH",
          "params": {
            "radius": 1
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_11": {
      "id": "spec_11",
      "name": "Farsight Marshal",
      "description": "Your Scouts gain +1 attack range and become ranged.",
      "effects": [
        {
          "type": "SCOUT_RANGE_BONUS",
          "params": {
            "bonus": 1
          }
        },
        {
          "type": "GRANT_UNIT_TAG_ALL",
          "params": {
            "unitType": "SCOUT",
            "tag": "RANGED"
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_12": {
      "id": "spec_12",
      "name": "Tramplelord",
      "description": "Your Riders push enemies one tile away on every hit (KNOCKBACK).",
      "effects": [
        {
          "type": "GRANT_UNIT_TAG_ALL",
          "params": {
            "unitType": "RIDER",
            "tag": "KNOCKBACK"
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_13": {
      "id": "spec_13",
      "name": "Hellbinder",
      "description": "All your SUMMONED units gain the RAGE and CLEAVE tags.",
      "effects": [
        {
          "type": "GRANT_TAG_TO_UNITS_WITH_TAG",
          "params": {
            "sourceTag": "SUMMONED",
            "tags": "RAGE,CLEAVE"
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_14": {
      "id": "spec_14",
      "name": "Hearthsteward",
      "description": "Each of your Farms can house 1 extra farmer.",
      "effects": [
        {
          "type": "HOUSING_CAP_BONUS",
          "params": {
            "amount": 1
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_15": {
      "id": "spec_15",
      "name": "Forgemaster",
      "description": "Units recruited within 5 rows of the lava front gain the CINDERBORN tag (+15 ATK and immunity to BURNING tile damage).",
      "effects": [
        {
          "type": "CINDERBORN_RECRUIT",
          "params": {
            "rows": 5,
            "attackBonus": 15
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_16": {
      "id": "spec_16",
      "name": "The Martyr",
      "description": "When one of your units is consumed by lava, all surviving Crystal Chambers begin resonating as if a chamber were destroyed.",
      "effects": [
        {
          "type": "RESONANCE_ON_UNIT_LAVA_DEATH",
          "params": {}
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_17": {
      "id": "spec_17",
      "name": "Bombardier",
      "description": "Your Siege units gain the BATTERY tag: each adjacent friendly unit grants +7 ATK, up to 3 stacks.",
      "effects": [
        {
          "type": "GRANT_UNIT_TAG_ALL",
          "params": {
            "unitType": "SIEGE",
            "tag": "BATTERY"
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_18": {
      "id": "spec_18",
      "name": "Echo Warden",
      "description": "While resonating, each Crystal Chamber within 3 rows of the lava front generates +1 extra crystal per turn.",
      "effects": [
        {
          "type": "RESONANCE_CRYSTAL_BONUS",
          "params": {
            "bonusRows": 3,
            "bonusCrystals": 1
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_19": {
      "id": "spec_19",
      "name": "Wallbreaker",
      "description": "Your Archers deal 50% bonus damage when attacking buildings.",
      "effects": [
        {
          "type": "ARCHER_VS_STRUCTURE",
          "params": {
            "damagePct": 50
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_20": {
      "id": "spec_20",
      "name": "Deathsworn",
      "description": "Your Archers gain the BERSERK tag: when HP drops below 50%, they gain +50% ATK. Once triggered, it stays active even if HP recovers.",
      "effects": [
        {
          "type": "GRANT_UNIT_TAG_ALL",
          "params": {
            "unitType": "ARCHER",
            "tag": "BERSERK"
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_21": {
      "id": "spec_21",
      "name": "Pathfinder",
      "description": "Capturing an enemy Stronghold immediately reveals the full zone it belongs to.",
      "effects": [
        {
          "type": "STRONGHOLD_ZONE_REVEAL",
          "params": {}
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_22": {
      "id": "spec_22",
      "name": "The Sundered",
      "description": "Your Mages unlock the Rupture spell: deals 50% of the target's current HP as damage for 1 crystal.",
      "effects": [
        {
          "type": "RUPTURE_UNLOCK",
          "params": {}
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_23": {
      "id": "spec_23",
      "name": "The Matriarch",
      "description": "Doubles farmer and noble housing caps and recruitment unit limits. New units have their iron and wood recruitment cost and max HP halved, rounded up.",
      "effects": [
        {
          "type": "POP_DOUBLING_DOCTRINE",
          "params": {}
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_24": {
      "id": "spec_24",
      "name": "Field Chirurgeon",
      "description": "Player units that took no action this turn are healed for 30 HP at the end of the player turn.",
      "effects": [
        {
          "type": "IDLE_HEAL",
          "params": {
            "amount": 30
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_25": {
      "id": "spec_25",
      "name": "Estate Warden",
      "description": "Each Patrician House houses 1 extra noble.",
      "effects": [
        {
          "type": "NOBLE_HOUSING_CAP_BONUS",
          "params": {
            "amount": 1
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    },
    "spec_26": {
      "id": "spec_26",
      "name": "Quartermaster",
      "description": "🎖️ Each recruitment building supports 1 additional unit. Crystal Caves and Crystal Chambers are not affected.",
      "effects": [
        {
          "type": "RECRUITMENT_CAP_BONUS",
          "params": {
            "amount": 1
          }
        }
      ],
      "assignedBuildingId": null,
      "upkeepIron": 0,
      "upkeepWood": 0,
      "dormant": false
    }
  },
  "globalSpecialistStorage": [],
  "resources": {
    "iron": 0,
    "wood": 0
  },
  "lavaFrontRow": 4,
  "turnsUntilLavaAdvance": 10,
  "selectedUnitId": null,
  "selectedBuildingId": null,
  "selectedTilePos": null,
  "pendingHealerId": null,
  "ember": 1,
  "emberLevelSources": {
    "turns": 0,
    "emberlingSacrifices": 1,
    "other": 0
  },
  "zonesUnlocked": [
    0
  ],
  "techNodes": {},
  "techFlags": [],
  "arcaneCrystals": 0,
  "unlockedBuildings": [],
  "unlockedUnits": [],
  "unlockedSpells": [],
  "gameStats": {
    "unitsKilled": 0,
    "unitsLost": 0,
    "damageDealt": 14,
    "damageReceived": 62,
    "unitsRecruited": 0,
    "buildingsConstructed": 0,
    "buildingsConverted": 0,
    "techsUnlocked": 0,
    "enemyBuildingsDestroyed": 0,
    "enemyBuildingsCaptured": 0,
    "buildingsDestroyedByEnemy": 0,
    "buildingsCapturedByEnemy": 0,
    "buildingsDestroyedByLava": 0
  },
  "seenHints": [],
  "enemyUnitsSpawnedLastTurn": 1,
  "difficulty": "NORMAL",
  "zoneLockoutUntilTurn": {},
  "spawnFreezeUntilTurn": 0,
  "spawnAccumulator": 0,
  "lastSpawnBudget": {
    "base": 1.5,
    "emberTerm": 0.3334,
    "margin": -10,
    "contactActive": true,
    "ddaRelief": -3,
    "budget": 1,
    "accumulatorBefore": 0,
    "spawnsNow": 1,
    "accumulatorAfter": 0,
    "spawnerWeights": [
      {
        "buildingId": "building_LAVALAIR_8",
        "distance": 1,
        "weight": 28.5,
        "picked": true
      }
    ]
  },
  "lavaFreezeUntilTurn": 0,
  "gameOverCause": null,
  "specialistSlotCap": 2,
  "activeCaveEncounters": [],
  "fortifiedGarrisonActive": false,
  "pendingSpellCast": null,
  "pendingTransposeFirstUnitId": null,
  "pendingBrandmarkTransforms": [],
  "pendingBridgeBuilderId": null,
  "pendingTrapSetterId": null,
  "portals": {},
  "readPlayerThemeCount": 0,
  "lastThemeSignature": null,
  "activeWaveTheme": null
} as unknown as GameState;
