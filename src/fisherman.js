if (process.argv.length < 6 || process.argv.length > 7) {
  console.log('Usage : node fisherman.js <prefix> <host> <port> <username> [<viewer_port>]');
  process.exit(1);
}

const DEBUG = true;

const [_, __, botPrefix, host, port, username, viewer_port] = process.argv;

const globalPrefix = '!all';

/**
 * Mineflayer declarations
 */
const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { GoalBlock, GoalNear, GoalFollow } = require('mineflayer-pathfinder').goals;

// #region UTILITY DECLARATIONS
/**
 * UTILITY DECLARATIONS START
 */
const getArguments = (command, username, prefix) => {
  const args = command.substr(prefix.length).match(/(".*?"|[^"\s]+)(?=\s*|\s*$)/g);

  if (!args) throw new Error('Empty arguments');

  const returnVal = { keyword: args[0], info: { commander: username, args: args.slice(1) } };

  return returnVal;
};
/**
 * UTILITY DECLARATIONS END
 */
//#endregion

const fisherman = mineflayer.createBot({
  host,
  port: parseInt(port),
  username,
});

const fishermanState = {
  isFishing: false,
  isStoring: false,
  isMoving: false,
  isUsingViewer: viewer_port ? true : false,
  shouldFish: false,
};

fisherman.loadPlugin(pathfinder);

fisherman.once('spawn', () => {
  const mcData = require('minecraft-data')(fisherman.version);
  const defaultMove = new Movements(fisherman, mcData);

  // #region LOOPS
  /**
   * LOOPS START
   */
  const bedTypes = [
    'white_bed',
    'orange_bed',
    'magenta_bed',
    'light_blue_bed',
    'yellow_bed',
    'lime_bed',
    'pink_bed',
    'gray_bed',
    'light_gray_bed',
    'cyan_bed',
    'purple_bed',
    'blue_bed',
    'brown_bed',
    'green_bed',
    'red_bed',
    'black_bed',
  ];
  const goToSleep = async () => {
    if (!fisherman.time.isDay && !fisherman.isSleeping) {
      const bedBlocks = fisherman.findBlocks({
        matching: bedTypes.map((bedName) => mcData.blocksByName[bedName].id),
        count: 10,
      });

      let i = 0;
      let bedBlock = null;

      const goToBed = async () => {
        if (i > bedBlocks.length - 1) {
          fisherman.chat("I can't find a suitable bed!");
          return;
        }

        bedBlock = fisherman.blockAt(bedBlocks[i]);
        moveToGoal(bedBlock.position, 'near');
        fisherman.on('goal_reached', handleGoToBed);
      };

      const handleGoToBed = async () => {
        try {
          await fisherman.sleep(bedBlock);
          fisherman.isSleeping = true;
          fisherman.chat("It's night! I'm going to sleep!");
          fisherman.on('wake', afterAwakeHandler);
        } catch (error) {
          console.log(error.message);
          i++;
          goToBed();
        } finally {
          fisherman.removeListener('goal_reached', handleGoToBed);
        }
      };

      goToBed();
    }
  };

  setInterval(() => {
    goToSleep();
  }, 5000);
  /**
   * LOOPS END
   */
  // #endregion

  // #region LISTENER HANDLERS
  /**
   * LISTENER HANDLERS START
   */
  const afterAwakeHandler = () => {
    fisherman.removeListener('wake', afterAwakeHandler);

    fisherman.chat('Rise and shine! Time to go fishing!');

    if (fishermanState.shouldFish) {
      startFishing();
    }
  };

  const reachedHandler = () => {
    fisherman.removeListener('goal_reached', reachedHandler);

    fisherman.chat("I'm here!");
  };

  const onCollectHandler = (player, entity) => {
    if (entity.kind === 'Drops' && player === fisherman.entity) {
      if (DEBUG) {
        console.log({ method: 'onCollectHandler', state: fishermanState });
      }

      if (!fishermanState.isFishing) {
        fisherman.removeListener('playerCollect', onCollectHandler);

        const { itemId } = entity.metadata[entity.metadata.length - 1];

        fisherman.chat(`I caught a ${mcData.items[itemId].displayName}!`);
        startFishing();
      }
    }
  };

  const reachedWaterHandler = () => {
    fisherman.removeListener('goal_reached', reachedWaterHandler);

    fisherman.chat('Reached my spot!');
  };
  /**
   * LISTENER HANDLERS END
   */
  // #endregion

  // #region HELPER COMMANDS
  /**
   * HELPER COMMANDS START
   */
  const getPlayerEntity = (playerName) => {
    return fisherman.players[playerName] ? fisherman.players[playerName].entity : null;
  };

  const moveToGoal = async (target, type = 'block', radius = 1) => {
    // console.log(target);

    if (fisherman.isSleeping) {
      await fisherman.wake();
    }

    if (fishermanState.isFishing) {
      await stopFishing();
    }

    fisherman.pathfinder.setMovements(defaultMove);

    let goal = null;

    if (type === 'block') {
      goal = new GoalBlock(target.x, target.y, target.z);
    } else if (type === 'near') {
      goal = new GoalNear(target.x, target.y, target.z, radius);
    } else {
      goal = null;
    }

    fisherman.pathfinder.setGoal(goal);
  };
  /**
   * HELPER COMMANDS END
   */
  // #endregion

  // #region ASYNC COMMANDS
  /**
   * ASYNC COMMANDS START
   */
  const startFishing = async () => {
    if (DEBUG) {
      console.log({ method: 'startFishing', state: fishermanState });
    }

    if (!fishermanState.isFishing) {
      const { waterBlock, groundBlock } = await getFishingSpot();

      if (!waterBlock || !groundBlock) return;

      moveToGoal(groundBlock.position.offset(0.5, 1, 0.5));

      const sf_afterReach = async () => {
        fisherman.removeListener('goal_reached', sf_afterReach);

        await fisherman.lookAt(waterBlock.position.offset(0.5, 1, 0.5), true);

        try {
          await fisherman.equip(mcData.itemsByName.fishing_rod.id, 'hand');
        } catch (error) {
          fisherman.chat("I don't have a fishing rod!");
          return;
        }

        fishermanState.shouldFish = true;
        fishermanState.isFishing = true;
        fisherman
          .fish()
          .then(() => {
            fishermanState.isFishing = false;
            fisherman.on('playerCollect', onCollectHandler);

            if (DEBUG) {
              console.log('playerCollectListener');
            }
          })
          .catch(() => {
            fisherman.removeListener('playerCollect', onCollectHandler);

            if (DEBUG) {
              console.log('Removed playerCollectListener');
            }

            console.log('Fishing cancelled');
          });
      };

      fisherman.on('goal_reached', sf_afterReach);
    }
  };

  const stopFishing = async (shouldContinue = false) => {
    if (DEBUG) {
      console.log({ method: 'stopFishing', state: fishermanState });
    }

    fisherman.removeListener('playerCollect', onCollectHandler);

    if (fishermanState.isFishing) {
      fisherman.activateItem();
      fishermanState.shouldFish = shouldContinue;
      fishermanState.isFishing = false;
      fisherman.chat('Stopped fishing!');
    }
    return;
  };

  const storeCatches = async () => {
    if (DEBUG) {
      console.log({ method: 'storeCatches', state: fishermanState });
    }

    const listOfTransferrableItems = [];
    for (const item of fisherman.inventory.items()) {
      if (item.type !== 684) {
        listOfTransferrableItems.push(item);
      }
    }

    if (listOfTransferrableItems.length <= 0) {
      fisherman.chat("I don't have anything to store!");
      return;
    }

    await stopFishing(true);

    const chestToOpen = fisherman.findBlock({
      matching: mcData.blocksByName['chest'].id,
      maxDistance: 32,
    });

    if (!chestToOpen) {
      fisherman.chat('No chests nearby!');
      return;
    }

    moveToGoal(chestToOpen.position, 'near', 4);

    const afterReach = async () => {
      fisherman.removeListener('goal_reached', afterReach);

      const chest = await fisherman.openChest(chestToOpen);

      let totalItemsStored = 0;

      for (let item of listOfTransferrableItems) {
        if (item.type !== 684) {
          try {
            totalItemsStored += item.count;
            await chest.deposit(item.type, null, item.count);
          } catch (error) {
            console.log(error.message);
          }
        }
      }

      fisherman.chat(`Stored ${totalItemsStored} item(s)!`);

      chest.close();

      if (fishermanState.shouldFish) {
        startFishing();
      }
    };

    fisherman.on('goal_reached', afterReach);
  };

  const goNearWater = async () => {
    const { groundBlock } = await getFishingSpot();

    if (!groundBlock) return;

    moveToGoal(groundBlock.position.offset(0.5, 1, 0.5));

    fisherman.once('goal_reached', reachedWaterHandler);
  };

  const getFishingSpot = async () => {
    const waterBlock = fisherman.findBlock({
      matching: ['water'].map((name) => mcData.blocksByName[name].id),
      useExtraInfo: (block) => {
        return (
          fisherman.blockAt(block.position.offset(0, 1, 0)).type === mcData.blocksByName['air'].id &&
          [
            [-1, 1],
            [0, 1],
            [1, 1],
            [-1, 0],
            [1, 0],
            [-1, -1],
            [0, -1],
            [1, -1],
          ].reduce((prev, curr, ix) => {
            const blockType = fisherman.blockAt(block.position.offset(curr[0], 1, curr[1])).type;
            return (
              prev || (blockType !== mcData.blocksByName['air'].id && blockType !== mcData.blocksByName['water'].id)
            );
          }, false)
        );
      },
      maxDistance: 32,
    });

    if (!waterBlock) {
      fisherman.chat('No water found nearby!');
      return { waterBlock: null, groundBlock: null };
    }

    const groundBlock = fisherman.findBlock({
      matching: (block) => {
        return block.type !== mcData.blocksByName['water'].id;
      },
      useExtraInfo: (block) =>
        block.position.distanceTo(waterBlock.position) <= 1 &&
        block.type !== mcData.blocksByName['air'].id &&
        fisherman.blockAt(block.position.offset(0, 1, 0)).type === mcData.blocksByName['air'].id,
      maxDistance: 16,
    });

    if (!groundBlock) {
      fisherman.chat('No place to stand!');
      return { waterBlock: null, groundBlock: null };
    }

    return { waterBlock, groundBlock };
  };
  /**
   * ASYNC COMMANDS END
   */
  // #endregion

  fisherman.on('chat', function (username, message) {
    if ((!message.startsWith(botPrefix) && !message.startsWith(globalPrefix)) || username === fisherman.username)
      return;

    let prefix = botPrefix;
    if (message.startsWith(globalPrefix)) {
      prefix = globalPrefix;
    }

    let command;
    try {
      command = getArguments(message, username, prefix);
    } catch (error) {
      console.log(error);
      return;
    }

    const keyword = command.keyword;
    const args = command.info.args;
    const commander = command.info.commander;

    switch (keyword) {
      case 'start':
        startFishing();
        break;
      case 'stop':
        stopFishing();
        break;
      case 'sleep':
        goToSleep();
        break;
      case 'nearwater':
        goNearWater();
        break;
      case 'goto':
        if (args.length === 1) {
          let targetUsername = args[0].replace(/"/g, '');

          if (targetUsername === fisherman.username) return;

          if (args[0] === 'me') {
            targetUsername = commander;
          }

          const target = getPlayerEntity(targetUsername);

          if (!target) {
            fisherman.chat(`Can't find anyone with the name ${targetUsername}`);
            return;
          }

          const { x, y, z } = target.position;

          fisherman.chat(`Im going to ${target.username}!`);

          moveToGoal({ x, y, z }, 'near');
        } else if (args.length === 3) {
          const [x, y, z] = args;

          fisherman.chat(`Im going to ${x}, ${y}, ${z}!`);

          moveToGoal({ x, y, z }, 'near');
        } else {
          fisherman.chat("I don't understand!");
        }

        fisherman.on('goal_reached', reachedHandler);
        break;
      case 'store':
        storeCatches();
        break;
      default:
        break;
    }
  });

  fisherman.on('path_update', (r) => {
    const nodesPerTick = ((r.visitedNodes * 50) / r.time).toFixed(2);

    console.log(`${r.path.length} moves. (${r.time.toFixed(2)} ms, (${nodesPerTick} n/t)). ${r.status}`);

    if (fishermanState.isUsingViewer) {
      const path = [fisherman.entity.position.offset(0, 0.5, 0)];

      for (const node of r.path) {
        path.push({ x: node.x, y: node.y + 0.5, z: node.z });
      }
      fisherman.viewer.drawLine('path', path, 0xff00ff);
    }
  });

  if (fishermanState.isUsingViewer) {
    const port = parseInt(viewer_port);

    require('prismarine-viewer').mineflayer(fisherman, {
      port,
      viewDistance: 6,
    });

    fisherman.viewer.on('blockClicked', (block, face, button) => {
      if (button !== 2) return;

      const p = block.position.offset(0, 1, 0);
      moveToGoal({ x: p.x, y: p.y, z: p.z });
    });
  }
});
