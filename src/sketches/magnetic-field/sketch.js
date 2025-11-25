/*

 Title: Electric field

 Author: by Juan Carlos Ponce Campuzano

 Based upon the work:
 https://github.com/isaacvr/coding
 by Issac https://github.com/isaacvr

*/

/*
 Keys:
 +: Add a random (+) particle
 -: Add a random (-) particle
 0: Remove last particle
 F: Draw flux
 C: Clear flux
*/

document.title = 'Electric Field';

const e0 = 8.854187e-12;
const RAD = 50; //radius of particle
const TOTAL = 1;

let WIDTH;
let HEIGHT;

let isFixed = true;
let potDraw = false;
//let aux = 0;

let system = []; //particles in array
let moving = [];
let paths = [];

//Setup function starts

function setup() {
  WIDTH = windowWidth;
  HEIGHT = windowHeight;
  createCanvas(WIDTH, HEIGHT);

  textAlign(CENTER, CENTER);
  textSize(RAD * 0.6);

  controls();

  for (let i = 0; i <= TOTAL; ++i) {
    if (i == 0) {
      system.push(new Particle(RAD));
    }
    if (i == 1) {
      sign = -1;
      system.push(new Particle(RAD));
    }
  }
  // Set initial values
  system[0].charge = 1.602176e-19;
  system[1].charge = -1.602176e-19;
  system[0].pos.re = (3 * width) / 9;
  system[0].pos.im = height / 2;
  system[1].pos.re = (6 * width) / 9;
  system[1].pos.im = height / 2;

  plotter = new Plotter();
  plotter.center = new Complex(0, 0);
  plotter.axes = Matrix.fromArray([1, 0, 0, -1], [2, 2]);
}

//Main Function to draw everything

function draw() {
  background(0);

  cursor(ARROW);
  drawField();

  //console.clear();
  //console.log(frameRate());

  if (!isFixed) {
    system[0].pos = new Complex(mouseX, mouseY);
  }

  /*
  for (let drag of system) {
    //cDrag.update();

    drag.update();
    drag.over();
    drag.show();
  }
  */

  updateMovingParticles();

  paths.forEach((path) => plotter.drawDirectedPath(path, color(204, 255, 255)));

  system.forEach((e) => {
    e.update();
    e.over();
    e.show();
  });

  //console.log(potDraw);
  //console.log(aux);
}

function windowResized() {
  //Canvas width
  width = 0.999 * windowWidth;
  resizeCanvas(width, height);

  clearScreen();

  //system.forEach((e) => {
  // e.pos = new Complex(random(RAD * 2, width - RAD * 2), random(RAD * 2, height - RAD * 2));
  // });

  plotter = new Plotter();
  plotter.center = new Complex(0, 0);
  plotter.axes = Matrix.fromArray([1, 0, 0, -1], [2, 2]);
}

function E(pos) {
  let res = new Complex(0, 0);

  for (let i = 0, maxi = system.length; i < maxi; i += 1) {
    let p = system[i];
    let r = pos.sub(p.pos);
    let rAbs = r.abs();
    if (rAbs * 2.5 < RAD && p.charge < 0) {
      return new Complex(0, 0);
    }
    let ur = r.div(rAbs);
    res = res.add(ur.mul(p.charge / (rAbs * rAbs)));
  }

  return res.div(4 * PI * e0);
}

function getColor(alpha) {
  if (alpha < 0) {
    return color(255, 0, 0);
  } else if (alpha > 1) {
    return color(0, 0, 255);
  } else {
    if (alpha < 0.5) {
      let red = int(map(alpha, 0, 0.5, 150, 200));
      return color(200, 120, red);
    } else {
      let green = int(map(alpha, 0.5, 1, 200, 150));
      return color(120, green, 200);
    }
  }
}

/*
function getColor(alpha) {
  if (alpha < 0) {
    return color(255, 255, 255);
  } else if (alpha > 0) {
    return color(255, 255, 255);
  }
}
*/

function drawField() {
  let resolution = 50;
  for (let i = resolution; i < width; i += resolution) {
    for (let j = resolution; j < height; j += resolution) {
      let elect = E(new Complex(i, j)).mul(1e15);
      let eAbs = elect.abs();
      let col = getColor(1 - exp(-eAbs / 50));
      elect = elect.mul((resolution * 0.6) / eAbs);
      plotter.drawSimpleArrow(
        new Complex(i, j),
        new Complex(i + elect.re, j + elect.im),
        col
      );
    }
  }
}

function generatePaths() {
  let di = TAU / 30;

  for (let i = 0, maxi = system.length; i < maxi; i += 1) {
    let p = system[i];
    if (p.charge > 0) {
      for (let j = 0; j <= TAU; j += di) {
        let pt = p.pos.add(
          new Complex({
            abs: RAD / 4,
            arg: j,
          })
        );
        moving.push(pt);
        paths.push([pt]);
      }
    }
  }

  let di1 = 70;

  for (let i = 0; i <= width || i <= height; i += di1) {
    if (i <= width) {
      moving.push(new Complex(i, 2));
      paths.push([new Complex(i, 2)]);
      moving.push(new Complex(i, height - 2));
      paths.push([new Complex(i, height - 2)]);
    }
    if (i <= height) {
      moving.push(new Complex(2, i));
      paths.push([new Complex(2, i)]);
      moving.push(new Complex(width - 2, i));
      paths.push([new Complex(width - 2, i)]);
    }
  }
}

function updateMovingParticles() {
  for (let i = 0, maxi = moving.length; i < maxi; i += 1) {
    let p = moving[i];
    if (!(p.re < 0 || p.re > width || p.im < 0 || p.im > height)) {
      // console.log('YEAH');
      let elect = E(p).mul(1e15);
      let len = clip(elect.abs(), 6, 15);
      elect = elect.mul(len / elect.abs());
      moving[i] = p.add(elect);
      plotter.drawPoint(moving[i]);
      paths[i].push(moving[i]);

      if (elect.re == 0 && elect.im == 0) {
        moving[i].re = -1;
      }
    }
  }
}

//https://keycode.info/

function keyPressed() {
  if (keyCode == 70) {
    potDraw = true;
    if (potDraw) {
      generatePaths();
    }
  } else if (keyCode == 67) {
    moving.length = 0;
    paths.length = 0;
    potDraw = true;
  } else if (keyCode == 81) {
    isFixed = !isFixed;
  } else if (keyCode == 187) {
    if (system.length < 15) {
      sign = 1;
      system.push(new Particle(RAD));
    }
    //moving.length = 0;
    //paths.length = 0;
    //potDraw = true;
    clearScreen();
  } else if (keyCode == 189) {
    if (system.length < 15) {
      sign = -1;
      system.push(new Particle(RAD));
    }
    //moving.length = 0;
    //paths.length = 0;
    //potDraw = true;
    clearScreen();
  } else if (keyCode == 48) {
    if (system.length > 0) {
      system.pop();
    }
    //moving.length = 0;
    //paths.length = 0;
    //potDraw = true;
    clearScreen();
  }
}
