// Who built Drive Loop and where the project lives, for the archived demo's footer.
// frontend/index.html (search engines, link previews) and README.md repeat the team: keep the three in step.
export interface Member { name: string; linkedin?: string }

export const TEAM: Member[] = [
  { name: 'Andrei Lahunou' },
  { name: 'Dimitrios Koutsoumpos', linkedin: 'https://www.linkedin.com/in/koutsoubosdimitrios/' },
  { name: 'Divya Bisht', linkedin: 'https://www.linkedin.com/in/divyabishtx/' },
  { name: 'Vladimir Lebedev', linkedin: 'https://www.linkedin.com/in/lebedevv/' },
]
export const CONTACT = TEAM[0]

export const LINKS = {
  project: 'https://tokensand.com/p/drive-loop',
  hackathon: 'https://tokensand.com/vastlondon',
  video: 'https://youtu.be/cKueRONRbL0',
  repo: 'https://github.com/vast-team-33/vaast-team-33-project',
}
