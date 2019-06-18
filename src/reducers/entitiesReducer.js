import { normalize, schema } from "normalizr";
import { createSelector } from "reselect";
import deepmerge from "deepmerge";
import {
  PROJECT_LOAD_SUCCESS,
  SPRITE_LOAD_SUCCESS,
  BACKGROUND_LOAD_SUCCESS,
  SPRITE_REMOVE,
  EDIT_PROJECT,
  EDIT_PROJECT_SETTINGS,
  ADD_SCENE,
  MOVE_SCENE,
  EDIT_SCENE,
  REMOVE_SCENE,
  ADD_ACTOR,
  EDIT_ACTOR,
  MOVE_ACTOR,
  REMOVE_ACTOR,
  MOVE_TRIGGER,
  EDIT_TRIGGER,
  REMOVE_TRIGGER,
  EDIT_PLAYER_START_AT,
  EDIT_SCENE_EVENT_DESTINATION_POSITION,
  EDIT_TRIGGER_EVENT_DESTINATION_POSITION,
  EDIT_ACTOR_EVENT_DESTINATION_POSITION,
  ADD_TRIGGER,
  RESIZE_TRIGGER
} from "../actions/actionTypes";
import clamp from "../lib/helpers/clamp";
import { patchEvents, regenerateEventIds } from "../lib/helpers/eventSystem";
import initialState from "./initialState";

const addEntity = (state, type, data) => {
  return {
    ...state,
    entities: {
      ...state.entities,
      [type]: {
        ...state.entities[type],
        [data.id]: data
      }
    },
    result: Object.assign(
      {},
      state.result,
      state.result[type] && {
        [type]: [].concat(state.result[type], data.id)
      }
    )
  };
};

const editEntity = (state, type, id, data) => {
  return {
    ...state,
    entities: {
      ...state.entities,
      [type]: {
        ...state.entities[type],
        [id]: {
          ...state.entities[type][id],
          ...data
        }
      }
    },
    result: state.result
  };
};

const removeEntity = (state, type, id) => {
  console.log("REMOVE ", id, "FROM", state.result[type], state.result);
  return {
    ...state,
    entities: {
      ...state.entities,
      [type]: {
        ...state.entities[type],
        [id]: null
      }
    },
    result: Object.assign(
      {},
      state.result,
      state.result[type] && {
        [type]: state.result[type].filter(entityId => entityId !== id)
      }
    )
    // result: {
    //   ...state.result,
    //   [type]: state.result[type].filter(entityId => entityId !== id)
    // }
  };
};

const matchAsset = assetA => assetB => {
  return assetA.filename === assetB.filename && assetA.plugin === assetB.plugin;
};

const notMatchAsset = assetA => assetB => {
  return assetA.filename !== assetB.filename || assetA.plugin !== assetB.plugin;
};

const MIN_SCENE_X = 60;
const MIN_SCENE_Y = 30;

// const eventSchema = new schema.Entity("event");
const backgroundSchema = new schema.Entity("backgrounds");
const musicSchema = new schema.Entity("music");
const actorSchema = new schema.Entity("actors", {
  // script: [eventSchema]
});
const triggerSchema = new schema.Entity("triggers", {
  // script: [eventSchema]
});
const spriteSheetsSchema = new schema.Entity("spriteSheets");
const variablesSchema = new schema.Entity("variables");
const sceneSchema = new schema.Entity("scenes", {
  actors: [actorSchema],
  triggers: [triggerSchema]
  // script: [eventSchema]
});
const projectSchema = {
  scenes: [sceneSchema],
  backgrounds: [backgroundSchema],
  music: [musicSchema],
  spriteSheets: [spriteSheetsSchema],
  variables: [variablesSchema]
};

const loadProject = (state, action) => {
  const data = normalize(action.data, projectSchema);
  const indexes = {
    // sceneIdForActor: Object.values(data.entities.scenes).reduce(
    //   (memo, scene) => {
    //     for (let i = 0; i < scene.actors.length; i++) {
    //       // eslint-disable-next-line no-param-reassign
    //       memo[scene.actors[i]] = scene.id;
    //     }
    //     return memo;
    //   },
    //   {}
    // )
  };
  return deepmerge(state, data);
};

const editProject = (state, action) => {
  return {
    ...state,
    result: {
      ...state.result,
      ...action.values
    }
  };
};

const editProjectSettings = (state, action) => {
  return {
    ...state,
    result: {
      ...state.result,
      settings: {
        ...state.result.settings,
        ...action.values
      }
    }
  };
};

const loadSprite = (state, action) => {
  const existingAsset = Object.values(state.entities.spriteSheets).find(
    matchAsset(action.data)
  );
  if (existingAsset) {
    return editEntity(state, "spriteSheets", existingAsset.id, {
      ...action.data,
      id: existingAsset.id
    });
  }
  return addEntity(state, "spriteSheets", action.data);
};

const removeSprite = (state, action) => {
  const existingAsset = Object.values(state.entities.spriteSheets).find(
    matchAsset(action.data)
  );
  return removeEntity(state, "spriteSheets", existingAsset.id);
};

const loadBackground = (state, action) => {
  const existingAsset = Object.values(state.entities.backgrounds).find(
    matchAsset(action.data)
  );
  if (existingAsset) {
    return fixSceneCollisions(
      editEntity(state, "backgrounds", existingAsset.id, {
        ...action.data,
        id: existingAsset.id
      })
    );
  }
  return addEntity(state, "backgrounds", action.data);
};

const fixSceneCollisions = state => {
  return {
    ...state,
    entities: {
      ...state.entities,
      scenes: Object.keys(state.entities.scenes).reduce((memo, sceneId) => {
        const scene = state.entities.scenes[sceneId];
        const background = state.entities.backgrounds[scene.backgroundId];
        const collisionsSize =
          background && Math.ceil((background.width * background.height) / 8);

        if (!background || scene.collisions.length !== collisionsSize) {
          // eslint-disable-next-line no-param-reassign
          memo[sceneId] = {
            ...scene,
            collisions: []
          };
        } else {
          // eslint-disable-next-line no-param-reassign
          memo[sceneId] = scene;
        }
        return memo;
      }, {})
    }
  };
};

const addScene = (state, action) => {
  const script =
    action.defaults &&
    action.defaults.script &&
    action.defaults.script.map(regenerateEventIds);

  const backgroundId = state.result.backgrounds[0];
  const background = state.entities.backgrounds[backgroundId];

  const newScene = Object.assign(
    {
      name: `Scene ${state.result.scenes.length + 1}`,
      backgroundId,
      width: background.width,
      height: background.height,
      actors: [],
      triggers: [],
      collisions: []
    },
    action.defaults || {},
    script && {
      script
    },
    {
      id: action.id,
      x: Math.max(MIN_SCENE_X, action.x),
      y: Math.max(MIN_SCENE_Y, action.y)
    }
  );
  return addEntity(state, "scenes", newScene);
};

const moveScene = (state, action) => {
  const scene = state.entities.scenes[action.sceneId];
  return editEntity(state, "scenes", action.sceneId, {
    x: Math.max(MIN_SCENE_X, action.x),
    y: Math.max(MIN_SCENE_Y, action.y)
  });
};

const editScene = (state, action) => {
  const scene = state.entities.scenes[action.sceneId];
  const actors = state.entities.actors;
  const triggers = state.entities.triggers;

  // If switched background use collisions from another
  // scene using the background already if available
  // otherwise make empty collisions array of
  // the correct size
  let newState = state;
  let newCollisions;
  let newActors;
  let newTriggers;
  let newBackground;

  if (action.values.backgroundId) {
    const otherScene = Object.values(state.entities.scenes).find(s => {
      return s.backgroundId === action.values.backgroundId;
    });
    const background = state.entities.backgrounds[action.values.backgroundId];

    if (otherScene) {
      newCollisions = otherScene.collisions;
    } else {
      const collisionsSize = Math.ceil(
        (background.width * background.height) / 8
      );
      newCollisions = [];
      for (let i = 0; i < collisionsSize; i++) {
        newCollisions[i] = 0;
      }
    }

    scene.actors.forEach(actorId => {
      const actor = actors[actorId];
      const x = Math.min(actor.x, background.width - 2);
      const y = Math.min(actor.y, background.height - 1);
      if (actor.x !== x || actor.y !== y) {
        newState = editEntity(newState, "actors", actor.id, { x, y });
      }
    });

    scene.triggers.forEach(triggerId => {
      const trigger = triggers[triggerId];
      const x = Math.min(trigger.x, background.width - 1);
      const y = Math.min(trigger.y, background.height - 1);
      const width = Math.min(trigger.width, background.width - x);
      const height = Math.min(trigger.height, background.height - y);
      if (
        trigger.x !== x ||
        trigger.y !== y ||
        trigger.width !== width ||
        trigger.height !== height
      ) {
        newState = editEntity(newState, "triggers", trigger.id, {
          x,
          y,
          width,
          height
        });
      }
    });

    newBackground = background;
  }

  return editEntity(
    newState,
    "scenes",
    action.sceneId,
    Object.assign(
      {},
      action.values,
      action.values.backgroundId && {
        collisions: newCollisions || [],
        width: newBackground.width,
        height: newBackground.height
      }
    )
  );
};

const removeScene = (state, action) => {
  return removeEntity(state, "scenes", action.sceneId);
};

const addActor = (state, action) => {
  const scene = state.entities.scenes[action.sceneId];
  const spriteSheetId = state.result.spriteSheets[0];
  const script =
    action.defaults &&
    action.defaults.script &&
    action.defaults.script.map(regenerateEventIds);
  const newActor = Object.assign(
    {
      spriteSheetId,
      movementType: "static",
      direction: "down",
      moveSpeed: "1",
      animSpeed: "3"
    },
    action.defaults || {},
    script && {
      script
    },
    {
      id: action.id,
      x: action.x,
      y: action.y
    }
  );

  // Add to scene
  const nextState = editEntity(state, "scenes", action.sceneId, {
    actors: [].concat(scene.actors, action.id)
  });

  return addEntity(nextState, "actors", newActor);
};

const moveActor = (state, action) => {
  const newScene = state.entities.scenes[action.newSceneId];

  let nextState = state;

  // If changed scene
  if (action.sceneId !== action.newSceneId) {
    const prevScene = state.entities.scenes[action.sceneId];

    // Remove from previous scene
    nextState = editEntity(nextState, "scenes", action.sceneId, {
      actors: prevScene.actors.filter(actorId => {
        return actorId !== action.id;
      })
    });

    // Add to new scene
    nextState = editEntity(nextState, "scenes", action.newSceneId, {
      actors: [].concat(newScene.actors, action.id)
    });
  }

  return editEntity(nextState, "actors", action.id, {
    x: clamp(action.x, 0, newScene.width - 2),
    y: clamp(action.y, 0, newScene.height - 1)
  });
};

const moveTrigger = (state, action) => {
  const newScene = state.entities.scenes[action.newSceneId];
  const trigger = state.entities.triggers[action.id];

  console.log("MOVE TRIGGER!!!!!!!!!");

  let nextState = state;

  // If changed scene
  if (action.sceneId !== action.newSceneId) {
    const prevScene = state.entities.scenes[action.sceneId];

    // Remove from previous scene
    nextState = editEntity(nextState, "scenes", action.sceneId, {
      triggers: prevScene.triggers.filter(actorId => {
        return actorId !== action.id;
      })
    });

    // Add to new scene
    nextState = editEntity(nextState, "scenes", action.newSceneId, {
      triggers: [].concat(newScene.triggers, action.id)
    });
  }

  return editEntity(nextState, "triggers", action.id, {
    x: clamp(action.x, 0, newScene.width - trigger.width),
    y: clamp(action.y, 0, newScene.height - trigger.height)
  });
};

const resizeTrigger = (state, action) => {
  return editEntity(state, "triggers", action.id, {
    x: Math.min(action.x, action.startX),
    y: Math.min(action.y, action.startY),
    width: Math.abs(action.x - action.startX) + 1,
    height: Math.abs(action.y - action.startY) + 1
  });
};

const editActor = (state, action) => {
  const actor = state.entities.actors[action.id];
  const patch = { ...action.values };

  // If changed spriteSheetId
  if (patch.spriteSheetId) {
    const newSprite = state.entities.spriteSheets[patch.spriteSheetId];
    // If new sprite not an actor then reset movement type back to static
    if (newSprite.numFrames !== 3 && newSprite.numFrames !== 6) {
      patch.movementType = "static";
    }
    const oldSprite = state.entities.spriteSheets[actor.spriteSheetId];
    // If new sprite is an actor and old one wasn't reset movement type to face interaction
    if (
      oldSprite &&
      newSprite &&
      oldSprite.id !== newSprite.id &&
      (oldSprite.numFrames !== 3 && oldSprite.numFrames !== 6) &&
      (newSprite.numFrames === 3 || newSprite.numFrames === 6)
    ) {
      patch.movementType = "faceInteraction";
    }

    if (newSprite && newSprite.numFrames <= actor.frame) {
      patch.frame = 0;
    }
  }
  // If static and cycling frames start from frame 1 (facing downwards)
  if (
    (patch.animate && actor.movementType === "static") ||
    patch.movementType === "static"
  ) {
    patch.direction = "down";
  }
  return editEntity(state, "actors", actor.id, patch);
};

const removeActor = (state, action) => {
  const scene = state.entities.scenes[action.sceneId];

  // Remove from scene
  const nextState = editEntity(state, "scenes", action.sceneId, {
    actors: scene.actors.filter(actorId => {
      return actorId !== action.id;
    })
  });

  return removeEntity(nextState, "actors", action.id);
};

const addTrigger = (state, action) => {
  const scene = state.entities.scenes[action.sceneId];
  const script =
    action.defaults &&
    action.defaults.script &&
    action.defaults.script.map(regenerateEventIds);
  const newTrigger = Object.assign(
    {
      trigger: "walk"
    },
    action.defaults || {},
    script && {
      script
    },
    {
      id: action.id,
      x: action.x,
      y: action.y,
      width: 1,
      height: 1
    }
  );

  // Add to scene
  const nextState = editEntity(state, "scenes", action.sceneId, {
    triggers: [].concat(scene.triggers, action.id)
  });

  return addEntity(nextState, "triggers", newTrigger);
};

const editTrigger = (state, action) => {
  const trigger = state.entities.triggers[action.id];
  const patch = { ...action.values };
  return editEntity(state, "triggers", trigger.id, patch);
};

const removeTrigger = (state, action) => {
  const scene = state.entities.scenes[action.sceneId];

  // Remove from scene
  const nextState = editEntity(state, "scenes", action.sceneId, {
    triggers: scene.triggers.filter(triggerId => {
      return triggerId !== action.id;
    })
  });

  return removeEntity(nextState, "triggers", action.id);
};

const editPlayerStartAt = (state, action) => {
  return editProjectSettings(state, {
    values: {
      startSceneId: action.sceneId,
      startX: action.x,
      startY: action.y
    }
  });
};

const editSceneEventDestinationPosition = (state, action) => {
  const scene = state.entities.scenes[action.sceneId];
  return editEntity(state, "scenes", action.sceneId, {
    script: patchEvents(scene.script, action.eventId, {
      sceneId: action.destSceneId,
      x: action.x,
      y: action.y
    })
  });
};

const editActorEventDestinationPosition = (state, action) => {
  const actor = state.entities.actors[action.id];
  return editEntity(state, "actors", action.id, {
    script: patchEvents(actor.script, action.eventId, {
      sceneId: action.destSceneId,
      x: action.x,
      y: action.y
    })
  });
};

const editTriggerEventDestinationPosition = (state, action) => {
  const trigger = state.entities.triggers[action.id];
  return editEntity(state, "triggers", action.id, {
    script: patchEvents(trigger.script, action.eventId, {
      sceneId: action.destSceneId,
      x: action.x,
      y: action.y
    })
  });
};

export default function project(state = initialState.entities, action) {
  switch (action.type) {
    case PROJECT_LOAD_SUCCESS:
      return loadProject(state, action);
    case EDIT_PROJECT:
      return editProject(state, action);
    case EDIT_PROJECT_SETTINGS:
      return editProjectSettings(state, action);
    case SPRITE_LOAD_SUCCESS:
      return loadSprite(state, action);
    case SPRITE_REMOVE:
      return removeSprite(state, action);
    case BACKGROUND_LOAD_SUCCESS:
      return loadBackground(state, action);
    case ADD_SCENE:
      return addScene(state, action);
    case MOVE_SCENE:
      return moveScene(state, action);
    case EDIT_SCENE:
      return editScene(state, action);
    case REMOVE_SCENE:
      return removeScene(state, action);
    case ADD_ACTOR:
      return addActor(state, action);
    case EDIT_ACTOR:
      return editActor(state, action);
    case MOVE_ACTOR:
      return moveActor(state, action);
    case REMOVE_ACTOR:
      return removeActor(state, action);
    case ADD_TRIGGER:
      return addTrigger(state, action);
    case EDIT_TRIGGER:
      return editTrigger(state, action);
    case MOVE_TRIGGER:
      return moveTrigger(state, action);
    case RESIZE_TRIGGER:
      return resizeTrigger(state, action);
    case REMOVE_TRIGGER:
      return removeTrigger(state, action);
    case EDIT_PLAYER_START_AT:
      return editPlayerStartAt(state, action);
    case EDIT_SCENE_EVENT_DESTINATION_POSITION:
      return editSceneEventDestinationPosition(state, action);
    case EDIT_ACTOR_EVENT_DESTINATION_POSITION:
      return editActorEventDestinationPosition(state, action);
    case EDIT_TRIGGER_EVENT_DESTINATION_POSITION:
      return editTriggerEventDestinationPosition(state, action);
    default:
      return state;
  }
}

// Selectors -------------------------------------------------------------------

export const getScenesLookup = state => state.entities.present.entities.scenes;
export const getSceneIds = state => state.entities.present.result.scenes;
export const getActorsLookup = state => state.entities.present.entities.actors;
export const getTriggersLookup = state =>
  state.entities.present.entities.triggers;
export const getBackgroundsLookup = state =>
  state.entities.present.entities.backgrounds;
export const getBackgroundIds = state =>
  state.entities.present.result.backgrounds;
export const getMusicLookup = state => state.entities.present.entities.music;
export const getMusicIds = state => state.entities.present.result.music;
export const getSpriteSheetsLookup = state =>
  state.entities.present.entities.spriteSheets;
export const getSpriteSheetIds = state =>
  state.entities.present.result.spriteSheets;
export const getSceneActorIds = (state, props) =>
  state.entities.present.entities.scenes[props.id].actors;

export const getMaxSceneRight = createSelector(
  [getScenesLookup, getSceneIds],
  (scenes, sceneIds) =>
    sceneIds.reduce((memo, sceneId) => {
      const scene = scenes[sceneId];
      const sceneRight = scene.x + scene.width * 8;
      if (sceneRight > memo) {
        return sceneRight;
      }
      return memo;
    }, 0)
);

export const getMaxSceneBottom = createSelector(
  [getScenesLookup, getSceneIds],
  (scenes, sceneIds) =>
    sceneIds.reduce((memo, sceneId) => {
      const scene = scenes[sceneId];
      const sceneBottom = scene.y + scene.height * 8;
      if (sceneBottom > memo) {
        return sceneBottom;
      }
      return memo;
    }, 0)
);

export const getSceneUniqueSpriteSheets = createSelector(
  [getSceneActorIds, getActorsLookup, getSpriteSheetsLookup],
  (actorIds, actors, spriteSheets) =>
    actorIds.reduce((memo, actorId) => {
      // console.log({ spriteSheets, actorIds, actors, actor: actors[actorId] });
      const spriteSheet = spriteSheets[actors[actorId].spriteSheetId];
      if (memo.indexOf(spriteSheet) === -1) {
        memo.push(spriteSheet);
      }
      return memo;
    }, [])
);

export const getSceneFrameCount = createSelector(
  [getSceneUniqueSpriteSheets],
  spriteSheets =>
    spriteSheets.reduce((memo, spriteSheet) => {
      return memo + (spriteSheet ? spriteSheet.numFrames : 0);
    }, 0)
);

export const getSceneActors = createSelector(
  [getSceneActorIds, getActorsLookup],
  (actorIds, actors) => actorIds.map(actorId => actors[actorId])
);

export const getMusic = createSelector(
  [getMusicIds, getMusicLookup],
  (musicIds, music) => musicIds.map(id => music[id])
);

export const getBackgrounds = createSelector(
  [getBackgroundIds, getBackgroundsLookup],
  (backgroundIds, backgrounds) => backgroundIds.map(id => backgrounds[id])
);

export const getSpriteSheets = createSelector(
  [getSpriteSheetIds, getSpriteSheetsLookup],
  (spriteSheetIds, spriteSheets) => spriteSheetIds.map(id => spriteSheets[id])
);

export const getScenes = createSelector(
  [getSceneIds, getScenesLookup],
  (sceneIds, scenes) => sceneIds.map(id => scenes[id])
);
