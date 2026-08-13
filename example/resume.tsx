import type { ComponentChildren } from 'preact'

/**
 * A section heading. `break-after` keeps one from stranding at the foot of a page
 * if the resume ever grows.
 */
const SectionHeader = ({ children }: { children: ComponentChildren }) => (
  <h2 class="text-lg leading-none font-bold text-accent break-after-avoid pt-1 pb-2">
    {children}
  </h2>
)

/**
 * One job: role and company on the left, italic location and dates pushed to the
 * right edge of the content column, bullets beneath.
 */
const Experience = ({
  heading,
  when,
  children,
}: {
  heading: string
  when: string
  children: ComponentChildren
}) => (
  <article class="py-0.5">
    <div class="flex items-baseline justify-between pb-1.5 break-after-avoid">
      <h3 class="font-bold">{heading}</h3>
      <em class="mr-5 text-right">{when}</em>
    </div>
    <ul class="[&>li]:ml-7 [&>li]:pb-1">{children}</ul>
  </article>
)

/** The heading, the `<title>`, and what the PDF reports as its own. */
export const title = 'Firstname Lastname'

const Resume = () => (
  <div class="page font-serif">
    <header class="flex items-center bg-accent text-white p-1">
      <h1 class="flex-1 text-2xl pl-1 leading-none">{title}</h1>
      <div class="flex flex-col gap-1 text-right">
        <p>name@example.com • (555) 555-0100</p>
        <p>City, ST 00000</p>
      </div>
    </header>

    <p class="py-2 text-base leading-none">
      One or two sentences summarising who you are and what you do.
    </p>

    <SectionHeader>Professional Experience</SectionHeader>

    <Experience
      heading="Job Title, Company Name"
      when="City, ST | Jan 2020 - Present">
      <li>Something you did, and what came of it.</li>
      <li>Something else you did.</li>
    </Experience>

    <Experience
      heading="Earlier Job Title, Earlier Company"
      when="City, ST | Jun 2017 - Dec 2019">
      <li>Something you did here, and what came of it.</li>
    </Experience>
  </div>
)

export default Resume
