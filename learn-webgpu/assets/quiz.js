/* Reusable retrieval-quiz grader for the WebGPU course.
   Markup contract (see assets/course.css for styles):

     <div class="quiz" data-quiz data-explain="One-line explanation shown after answering.">
       <div class="q">Question text?</div>
       <button class="opt" data-correct>Right answer</button>
       <button class="opt">Distractor</button>
       <button class="opt">Distractor</button>
       <div class="feedback"></div>
     </div>

   Keep every option the same word count (and near-equal characters) so length
   never leaks the answer. First click locks the question. */
(function () {
  function gradeQuiz(quiz) {
    var opts = Array.prototype.slice.call(quiz.querySelectorAll('.opt'));
    var feedback = quiz.querySelector('.feedback');
    var answered = false;

    opts.forEach(function (opt) {
      opt.addEventListener('click', function () {
        if (answered) return;
        answered = true;

        var isCorrect = opt.hasAttribute('data-correct');
        opt.classList.add(isCorrect ? 'correct' : 'wrong');

        if (!isCorrect) {
          // reveal the right one so the learner sees the target
          opts.forEach(function (o) {
            if (o.hasAttribute('data-correct')) o.classList.add('correct');
          });
        }

        if (feedback) {
          var explain = quiz.getAttribute('data-explain') || '';
          feedback.textContent = (isCorrect ? '✓ Correct. ' : '✗ Not quite. ') + explain;
          feedback.style.color = isCorrect ? 'var(--ok)' : 'var(--accent)';
        }

        opts.forEach(function (o) {
          o.style.pointerEvents = 'none';
        });
      });
    });
  }

  function init() {
    Array.prototype.slice
      .call(document.querySelectorAll('[data-quiz]'))
      .forEach(gradeQuiz);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
