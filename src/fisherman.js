if (process.argv.length < 5 || process.argv.length > 7) {
  console.log('Usage : node fisherman.js <prefix> <host> <port> [<name>] [<password>]');
  process.exit(1);
}

/**
 * Mineflayer declarations
 */
const mineflayer = require('mineflayer');
const mineflayerViewer = require('prismarine-viewer').mineflayer;
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { GoalBlock, GoalNear, GoalFollow } = require('mineflayer-pathfinder').goals;

/**
 * Utility declarations
 */
const getArguments = require('./utils/getArgs');

const prefix = process.argv[2];

const fisherman = mineflayer.createBot({
  host: process.argv[3],
  port: parseInt(process.argv[4]),
  username: process.argv[5] ? process.argv[5] : 'Fisherman',
  password: process.argv[6],
});

const fishermanState = {
  isFishing: false,
  isStoring: false,
  isMoving: false,
  shouldFish: false,
};

fisherman.loadPlugin(pathfinder);

// mineflayerViewer(botRef, { port: 3000 });

fisherman.once('spawn', () => {
  const mcData = require('minecraft-data')(fisherman.version);
  const defaultMove = new Movements(fisherman, mcData);

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
  const shouldSleepLoop = async () => {
    if (!fisherman.time.isDay && !fisherman.isSleeping) {
      const bedBlocks = fisherman.findBlocks({
        matching: bedTypes.map((bedName) => mcData.blocksByName[bedName].id),
        count: 10,
      });

      let i = 0;
      let bedBlock = null;

      const goToBed = () => {
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
          await stopFishing(true);
          fisherman.on('wake', afterAwakeHandler);
        } catch (error) {
          console.log(error.message);
          i++;
          goToBed();
        }

        fisherman.removeListener('goal_reached', handleGoToBed);
      };

      goToBed();
    }
  };

  setInterval(() => {
    shouldSleepLoop();
  }, 5000);

  /**
   * LOOPS END
   */

  /**
   * LISTENER HANDLERS START
   */

  const afterAwakeHandler = () => {
    if (fishermanState.shouldFish) {
      startFishing();
    }
    fisherman.removeListener('wake', afterAwakeHandler);
  };

  const reachedHandler = () => {
    fisherman.chat("I'm here!");
    fisherman.removeListener('goal_reached', reachedHandler);
  };

  const onCollectHandler = (player, entity) => {
    if (entity.kind === 'Drops' && player === fisherman.entity) {
      if (fishermanState.isFishing === false) {
        const { itemId } = entity.metadata[entity.metadata.length - 1];
        fisherman.chat(`I caught a ${mcData.items[itemId].displayName}!`);
        fisherman.removeListener('playerCollect', onCollectHandler);
        startFishing();
      }
    }
  };

  const reachedWaterHandler = () => {
    fisherman.chat('Reached my spot!');
    fisherman.removeListener('goal_reached', reachedWaterHandler);
  };

  /**
   * LISTENER HANDLERS END
   */

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

  /**
   * ASYNC COMMANDS START
   */

  const startFishing = async () => {
    if (fishermanState.isFishing === false) {
      const { waterBlock, groundBlock } = await getFishingSpot();

      moveToGoal(groundBlock.position, 'near');

      const sf_afterReach = async () => {
        fisherman.removeListener('goal_reached', sf_afterReach);

        await fisherman.lookAt(waterBlock.position.offset(0, 1, 0), true);

        try {
          await fisherman.equip(mcData.itemsByName.fishing_rod.id, 'hand');
        } catch (error) {
          fisherman.chat("I don't have a fishing rod!");
          return;
        }

        fisherman.on('playerCollect', onCollectHandler);

        try {
          fishermanState.shouldFish = true;
          fishermanState.isFishing = true;
          await fisherman.fish();
          fishermanState.isFishing = false;
        } catch (error) {
          console.log('Fishing cancelled');
        }
      };

      fisherman.on('goal_reached', sf_afterReach);
    }
  };

  const stopFishing = async (shouldContinue = false) => {
    if (fishermanState.isFishing === true) {
      fisherman.removeListener('playerCollect', onCollectHandler);
      fisherman.activateItem();
      fishermanState.shouldFish = shouldContinue;
      fishermanState.isFishing = false;
      fisherman.chat('Stopped fishing!');
    }
  };

  const storeCatches = async () => {
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

    await stopFishing();

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

      await chest.close();

      if (fishermanState.shouldFish) {
        startFishing();
      }
    };

    fisherman.on('goal_reached', afterReach);
  };

  const goNearWater = async () => {
    const { groundBlock } = await getFishingSpot();

    moveToGoal(groundBlock.position.offset(0.5, 1, 0.5), 'near');

    fisherman.once('goal_reached', reachedWaterHandler);
  };

  const getFishingSpot = async () => {
    const waterBlock = fisherman.findBlock({
      matching: ['water'].map((name) => mcData.blocksByName[name].id),
      useExtraInfo: (block) => fisherman.blockAt(block.position.offset(0, 1, 0)).type === mcData.blocksByName['air'].id,
      maxDistance: 32,
    });

    if (!waterBlock) {
      fisherman.chat('No water found nearby!');
      return;
    }

    const groundBlock = fisherman.findBlock({
      matching: (block) => {
        return block.type !== mcData.blocksByName['water'].id;
      },
      useExtraInfo: (block) =>
        block.position.distanceTo(waterBlock.position) <= 1 &&
        fisherman.blockAt(block.position.offset(0, 1, 0)).type === mcData.blocksByName['air'].id,
      maxDistance: 32,
    });

    if (!groundBlock) {
      fisherman.chat('No place to stand!');
      return;
    }

    return { waterBlock, groundBlock };
  };

  /**
   * ASYNC COMMANDS END
   */

  fisherman.on('chat', function (username, message) {
    if (!message.startsWith(prefix) || username === fisherman.username) return;

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

          stopFishing();

          fisherman.chat(`Im going to ${target.username}!`);

          moveToGoal({ x, y, z }, 'near');
        } else if (args.length === 3) {
          const [x, y, z] = args;

          stopFishing();

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
  });
});
