let chk1;
let chk2;
let sign = 1;

let butAdd;
let butAddN;
let butRem;
let butToggle;
let butClear;
let butPot;

function controls() {
  butAdd = createButton('Add (+)');
  butAdd.mousePressed(addParticles);
  butAdd.addClass('button');
  butAdd.position(10, 5);

  butAddN = createButton('Add (-)');
  butAddN.mousePressed(addParticlesN);
  butAddN.addClass('button');
  butAddN.position(butAdd.x + 65, 5);

  butRem = createButton('Remove');
  butRem.mousePressed(removeParticles);
  butRem.addClass('button');
  butRem.position(butAdd.x + 125, 5);

  /*
  butToggle = createButton("Pos/Neg");
  butToggle.mousePressed(changeSign);
  butToggle.addClass('button');
  butToggle.position(butAdd.x + 165, height - 40);
  */

  butPot = createButton('Draw Flux');
  butPot.mousePressed(linesP);
  butPot.addClass('button');
  butPot.position(butAdd.x + 240, 5);

  butClear = createButton('Clear');
  butClear.mousePressed(clearScreen);
  butClear.addClass('button');
  butClear.position(butAdd.x + 335, 5);
}

//Add (+) particles
function addParticles() {
  sign = 1;
  if (system.length < 15) {
    system.push(new Particle(RAD));
  }

  clearScreen();
}

//Add (-) particles
function addParticlesN() {
  sign = -1;
  if (system.length < 15) {
    system.push(new Particle(RAD));
  }

  clearScreen();
}

function removeParticles() {
  if (system.length > 1) {
    system.pop(new Particle(RAD));
  }
  clearScreen();
}

function changeSign() {
  if (c == true) {
    sign = 1;
  } else sign = -1;
  c = !c;
}

function clearScreen() {
  potDraw = false;
  moving.length = 0;
  paths.length = 0;
}

function linesP() {
  aux = 1;

  /*
  if (potDraw == false && aux == 1) {
    potDraw = true;
  } else {
    potDraw = false;
  }*/
  potDraw = true;

  if (potDraw == true) {
    generatePaths();
  }
}
