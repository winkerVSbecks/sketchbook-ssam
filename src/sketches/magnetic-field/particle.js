//Particle classs, draggable

class Particle {
  constructor(RAD) {
    this.rad = RAD;

    this.dragging = false; // Is the object being dragged?
    this.rollover = false; // Is the mouse over the ellipse?

    this.bs = 30;

    if (sign < 0) {
      this.label = '-';
      this.mass = 9.109382e-31;
      this.charge = -1.602176e-19;
    } else {
      this.label = '+';
      this.mass = 1.672621e-27;
      this.charge = 1.602176e-19;
    }

    this.pos = new Complex(
      random(RAD * 2, width - RAD * 2),
      random(RAD * 2, height - RAD * 2)
    );
  }

  over() {
    // Is mouse over object
    if (
      mouseX > this.pos.re - this.bs &&
      mouseX < this.pos.re + this.bs &&
      mouseY > this.pos.im - this.bs &&
      mouseY < this.pos.im + this.bs
    ) {
      this.rollover = true;
    } else {
      this.rollover = false;
    }
  }

  update() {
    // Adjust location if being dragged
    if (this.dragging) {
      clearScreen();
      this.pos.re = mouseX + this.offsetX;
      this.pos.im = mouseY + this.offsetY;
    }
  }

  show() {
    imageMode(CENTER);
    strokeWeight(4);

    if (this.charge < 0) {
      stroke(198, 74, 75);
      // Different fill based on state
      if (this.dragging) {
        cursor('grab');
        fill(223, 149, 139, 100);
      } else if (this.rollover) {
        cursor(HAND);
        fill(223, 149, 139, 180);
      } else {
        fill(223, 149, 139);
      }
    } else {
      stroke(27, 117, 8);

      // Different fill based on state
      if (this.dragging) {
        cursor('grab');
        fill(103, 145, 203, 100);
      } else if (this.rollover) {
        cursor(HAND);
        fill(103, 145, 203, 160);
      } else {
        fill(103, 145, 203);
      }
    }

    ellipse(this.pos.re, this.pos.im, this.rad, this.rad);

    if (this.rad > 10) {
      stroke(0);
      strokeWeight(1);
      fill(255);
      text(this.label, this.pos.re, this.pos.im);
    }
  }

  pressed() {
    // Did I click on the cirlce?
    if (
      mouseX > this.pos.re - this.bs &&
      mouseX < this.pos.re + this.bs &&
      mouseY > this.pos.im - this.bs &&
      mouseY < this.pos.im + this.bs
    ) {
      this.dragging = true;
      // If so, keep track of relative location of click to corner of rectangle
      this.offsetX = this.pos.re - mouseX;
      this.offsetY = this.pos.im - mouseY;
    }
  }

  released() {
    // Quit dragging
    this.dragging = false;
  }
}

function mousePressed() {
  for (let drag of system) {
    drag.pressed();
  }
}

function mouseReleased() {
  for (let drag of system) {
    // Quit dragging
    drag.released();
  }
}

/*
prevents the mobile browser from processing some default
touch events, like swiping left for "back" or scrolling
the page.
*/
/*
function touchStarted(){
  for (let drag of system) {
    drag.pressed();
    cursor('grab');
  }
  return false;
}

function touchMoved(){
  return false;
}

function touchEnded(){
  for (let drag of system) {
    // Quit dragging
    drag.released();
    //cursor(ARROW);
  }
  return false;
}
*/

function touchStarted() {
  for (let drag of system) {
    drag.pressed();
    //cursor('grab');
  }
  //moving.length = 0;
  //paths.length = 0;
  //potDraw = true;
  //textIni = false;
}

function touchEnded() {
  for (let drag of system) {
    // Quit dragging
    drag.released();
    //cursor(ARROW);
  }
}
