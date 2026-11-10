import './clues.css';

/** Clue content is for signed-in learners; `newTab` opens the login outside an embedding frame. */
export function SignInPrompt({ newTab = false }: { newTab?: boolean }) {
  return (
    <div className="sign-in-prompt">
      <p className="headline">Sign in to see clues</p>
      <p>The clue catalogue and its images are only shown to signed-in learners.</p>
      <a
        className="cta"
        href="/login"
        {...(newTab && { target: '_blank', rel: 'noreferrer noopener' })}
      >
        Sign in
      </a>
    </div>
  );
}
